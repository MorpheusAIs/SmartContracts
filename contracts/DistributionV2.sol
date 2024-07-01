// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import {PRECISION} from "@solarity/solidity-lib/utils/Globals.sol";

import {LinearDistributionIntervalDecrease} from "./libs/LinearDistributionIntervalDecrease.sol";

import {L1Sender} from "./L1Sender.sol";
import {IDistributionV2} from "./interfaces/IDistributionV2.sol";

import {LogExpMath} from "./libs/LogExpMath.sol";

contract DistributionV2 is IDistributionV2, OwnableUpgradeable, UUPSUpgradeable {
    using SafeERC20 for IERC20;

    uint128 constant DECIMAL = 1e18;
    uint256 constant POWER_MAX = (DECIMAL * 1661327546) / 100000000;

    bool public isNotUpgradeable;

    address public depositToken;
    address public l1Sender;

    // Pool storage
    Pool[] public pools;
    mapping(uint256 => PoolData) public poolsData;

    // User storage
    mapping(address => mapping(uint256 => UserData)) public usersData;

    // Total deposited storage
    uint256 public totalDepositedInPublicPools;

    // TODO: add function to change this value
    uint128 public constant distributionPeriod = 489283200; // 489283200

    /**********************************************************************************************/
    /*** Modifiers                                                                              ***/
    /**********************************************************************************************/
    modifier poolExists(uint256 poolId_) {
        require(_poolExists(poolId_), "DS: pool doesn't exist");
        _;
    }

    modifier poolPublic(uint256 poolId_) {
        require(pools[poolId_].isPublic, "DS: pool isn't public");
        _;
    }

    /**********************************************************************************************/
    /*** Init                                                                                   ***/
    /**********************************************************************************************/

    constructor() {
        _disableInitializers();
    }

    function Distribution_init(
        address depositToken_,
        address l1Sender_,
        Pool[] calldata poolsInfo_
    ) external initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();

        for (uint256 i; i < poolsInfo_.length; ++i) {
            createPool(poolsInfo_[i]);
        }

        depositToken = depositToken_;
        l1Sender = l1Sender_;
    }

    /**********************************************************************************************/
    /*** Pool managment and data retrieval                                                      ***/
    /**********************************************************************************************/
    function createPool(Pool calldata pool_) public onlyOwner {
        require(pool_.payoutStart > block.timestamp, "DS: invalid payout start value");

        _validatePool(pool_);
        pools.push(pool_);

        emit PoolCreated(pools.length - 1, pool_);
    }

    function editPool(uint256 poolId_, Pool calldata pool_) external onlyOwner poolExists(poolId_) {
        _validatePool(pool_);
        require(pools[poolId_].isPublic == pool_.isPublic, "DS: invalid pool type");

        PoolData storage poolData = poolsData[poolId_];
        uint256 currentPoolRate_ = _getCurrentPoolRate(poolId_);

        // Update pool data
        poolData.rate = currentPoolRate_;
        poolData.lastUpdate = uint128(block.timestamp);

        pools[poolId_] = pool_;

        emit PoolEdited(poolId_, pool_);
    }

    function getPeriodReward(uint256 poolId_, uint128 startTime_, uint128 endTime_) public view returns (uint256) {
        if (!_poolExists(poolId_)) {
            return 0;
        }

        Pool storage pool = pools[poolId_];

        return
            LinearDistributionIntervalDecrease.getPeriodReward(
                pool.initialReward,
                pool.rewardDecrease,
                pool.payoutStart,
                pool.decreaseInterval,
                startTime_,
                endTime_
            );
    }

    function _validatePool(Pool calldata pool_) private pure {
        require(pool_.decreaseInterval > 0, "DS: invalid decrease interval");
    }

    /**********************************************************************************************/
    /*** User management in private pools                                                       ***/
    /**********************************************************************************************/
    function manageUsersInPrivatePool(
        uint256 poolId_,
        address[] calldata users_,
        uint256[] calldata amounts_,
        uint128[] calldata lockEnds_
    ) external onlyOwner poolExists(poolId_) {
        require(!pools[poolId_].isPublic, "DS: pool is public");
        require(users_.length == amounts_.length, "DS: invalid length");
        require(users_.length == lockEnds_.length, "DS: invalid length");

        uint256 currentPoolRate_ = _getCurrentPoolRate(poolId_);

        for (uint256 i; i < users_.length; ++i) {
            address user_ = users_[i];
            uint256 amount_ = amounts_[i];
            uint128 lockEnd_ = lockEnds_[i];

            uint256 deposited_ = usersData[user_][poolId_].realDeposited;

            if (deposited_ < amount_) {
                _stake(user_, poolId_, amount_ - deposited_, currentPoolRate_, lockEnd_);
            } else if (deposited_ > amount_) {
                _withdraw(user_, poolId_, deposited_ - amount_, currentPoolRate_);
            }
        }
    }

    /**********************************************************************************************/
    /*** Stake, claim, withdraw                                                                 ***/
    /**********************************************************************************************/
    function stake(
        uint256 poolId_,
        uint256 amount_,
        uint128 lockEnd_
    ) external poolExists(poolId_) poolPublic(poolId_) {
        _stake(_msgSender(), poolId_, amount_, _getCurrentPoolRate(poolId_), lockEnd_);
    }

    function claim(uint256 poolId_, address receiver_) external payable poolExists(poolId_) {
        address user_ = _msgSender();

        Pool storage pool = pools[poolId_];
        PoolData storage poolData = poolsData[poolId_];
        UserData storage userData = usersData[user_][poolId_];

        require(block.timestamp > pool.payoutStart + pool.claimLockPeriod, "DS: pool claim is locked");
        require(block.timestamp > userData.lockEnd, "DS: user claim is locked");

        uint256 currentPoolRate_ = _getCurrentPoolRate(poolId_);
        uint256 pendingRewards_ = _getCurrentUserReward(currentPoolRate_, userData);
        require(pendingRewards_ > 0, "DS: nothing to claim");

        uint256 overDeposit_ = userData.totalDeposited - userData.realDeposited;
        if (overDeposit_ != 0) {
            poolData.totalDeposited -= overDeposit_;

            userData.totalDeposited = userData.realDeposited;
        }

        // Update pool data
        poolData.lastUpdate = uint128(block.timestamp);
        poolData.rate = currentPoolRate_;

        // Update user data
        userData.rate = currentPoolRate_;
        userData.pendingRewards = 0;

        // Transfer rewards
        L1Sender(l1Sender).sendMintMessage{value: msg.value}(receiver_, pendingRewards_, user_);

        emit UserClaimed(poolId_, user_, receiver_, pendingRewards_);
    }

    function withdraw(uint256 poolId_, uint256 amount_) external poolExists(poolId_) poolPublic(poolId_) {
        _withdraw(_msgSender(), poolId_, amount_, _getCurrentPoolRate(poolId_));
    }

    function getCurrentUserMultiplier(uint256 poolId_, address user_) public view returns (uint256) {
        if (!_poolExists(poolId_)) {
            return 0;
        }

        UserData storage userData = usersData[user_][poolId_];

        if (userData.realDeposited == 0) {
            return PRECISION;
        }

        return (userData.totalDeposited * PRECISION) / userData.realDeposited;
    }

    function lockClaim(uint256 poolId_, uint128 lockEnd_) external poolExists(poolId_) {
        // do we need to check if the pool is public?

        require(lockEnd_ > block.timestamp, "DS: invalid lock end value");
        require(block.timestamp > pools[poolId_].payoutStart, "DS: invalid lock start value");

        address user_ = _msgSender();
        uint256 currentPoolRate_ = _getCurrentPoolRate(poolId_);

        PoolData storage poolData = poolsData[poolId_];
        UserData storage userData = usersData[user_][poolId_];

        require(userData.realDeposited > 0, "DS: user isn't staked");

        // require(pools[poolId_].payoutStart < block.timestamp, "DS: pool isn't started");
        // require(getCurrentUserReward(poolId_, user_) > 0, "DS: nothing to lock");

        userData.pendingRewards = _getCurrentUserReward(currentPoolRate_, userData);

        uint128 lockStart_;
        if (userData.lockEnd < block.timestamp) {
            lockStart_ = uint128(block.timestamp);
        } else {
            lockStart_ = userData.lockStart;
        }
        uint256 lockMultiplier_ = _getSpecificPeriodMultiplier(pools[poolId_], lockStart_, lockEnd_);
        uint256 amountWithMultiplier_ = (userData.realDeposited * lockMultiplier_) / PRECISION;

        // Update pool data
        poolData.lastUpdate = uint128(block.timestamp);
        poolData.rate = currentPoolRate_;
        poolData.totalDeposited += amountWithMultiplier_ - userData.realDeposited;

        // Update user data
        userData.lastStake = uint128(block.timestamp);
        userData.rate = currentPoolRate_;
        userData.totalDeposited = amountWithMultiplier_;
        userData.lockStart = lockStart_;
        userData.lockEnd = lockEnd_;

        // event
    }

    function resetLockMultiplier(address user_, uint256 poolId_) external {
        UserData storage userData = usersData[user_][poolId_];

        if (getCurrentUserMultiplier(poolId_, user_) == PRECISION) {
            return;
        }

        PoolData storage poolData = poolsData[poolId_];

        uint256 currentPoolRate_ = _getCurrentPoolRate(poolId_);

        userData.pendingRewards = _getCurrentUserReward(currentPoolRate_, userData);

        // Update pool data
        poolData.lastUpdate = uint128(block.timestamp);
        poolData.rate = currentPoolRate_;
        poolData.totalDeposited -= userData.totalDeposited - userData.realDeposited;

        // Update user data
        userData.rate = currentPoolRate_;
        userData.totalDeposited = userData.realDeposited;
    }

    function getCurrentUserReward(uint256 poolId_, address user_) public view returns (uint256) {
        if (!_poolExists(poolId_)) {
            return 0;
        }

        UserData storage userData = usersData[user_][poolId_];
        uint256 currentPoolRate_ = _getCurrentPoolRate(poolId_);

        return _getCurrentUserReward(currentPoolRate_, userData);
    }

    function _stake(
        address user_,
        uint256 poolId_,
        uint256 amount_,
        uint256 currentPoolRate_,
        uint128 lockEnd_
    ) private {
        require(amount_ > 0, "DS: nothing to stake");

        Pool storage pool = pools[poolId_];
        PoolData storage poolData = poolsData[poolId_];
        UserData storage userData = usersData[user_][poolId_];

        if (pool.isPublic) {
            // https://docs.lido.fi/guides/lido-tokens-integration-guide/#steth-internals-share-mechanics
            uint256 balanceBefore_ = IERC20(depositToken).balanceOf(address(this));
            IERC20(depositToken).safeTransferFrom(_msgSender(), address(this), amount_);
            uint256 balanceAfter_ = IERC20(depositToken).balanceOf(address(this));

            amount_ = balanceAfter_ - balanceBefore_;

            require(userData.realDeposited + amount_ >= pool.minimalStake, "DS: amount too low");

            totalDepositedInPublicPools += amount_;
        }

        userData.pendingRewards = _getCurrentUserReward(currentPoolRate_, userData);

        uint256 amountWithMultiplier_;
        if (lockEnd_ > block.timestamp) {
            uint256 lockMultiplier_ = _getSpecificPeriodMultiplier(pool, uint128(block.timestamp), lockEnd_);
            amountWithMultiplier_ = (amount_ * lockMultiplier_) / PRECISION;

            userData.lockStart = uint128(block.timestamp);
        } else {
            amountWithMultiplier_ = amount_;
        }

        // Update pool data
        poolData.lastUpdate = uint128(block.timestamp);
        poolData.rate = currentPoolRate_;
        poolData.totalDeposited += amountWithMultiplier_;

        // Update user data
        userData.lastStake = uint128(block.timestamp);
        userData.rate = currentPoolRate_;
        userData.realDeposited += amount_;
        userData.totalDeposited += amountWithMultiplier_;
        userData.lockEnd = lockEnd_;

        emit UserStaked(poolId_, user_, amount_);
    }

    function _withdraw(address user_, uint256 poolId_, uint256 amount_, uint256 currentPoolRate_) private {
        Pool storage pool = pools[poolId_];
        PoolData storage poolData = poolsData[poolId_];
        UserData storage userData = usersData[user_][poolId_];

        uint256 deposited_ = userData.realDeposited;
        require(deposited_ > 0, "DS: user isn't staked");

        if (amount_ > deposited_) {
            amount_ = deposited_;
        }

        uint256 newDeposited_;
        if (pool.isPublic) {
            require(
                block.timestamp < pool.payoutStart ||
                    (block.timestamp > pool.payoutStart + pool.withdrawLockPeriod &&
                        block.timestamp > userData.lastStake + pool.withdrawLockPeriodAfterStake),
                "DS: pool withdraw is locked"
            );

            uint256 depositTokenContractBalance_ = IERC20(depositToken).balanceOf(address(this));
            if (amount_ > depositTokenContractBalance_) {
                amount_ = depositTokenContractBalance_;
            }

            newDeposited_ = deposited_ - amount_;

            require(amount_ > 0, "DS: nothing to withdraw");
            require(newDeposited_ >= pool.minimalStake || newDeposited_ == 0, "DS: invalid withdraw amount");
        } else {
            newDeposited_ = deposited_ - amount_;
        }

        uint256 amountWithMultiplier_;
        uint256 newDepositedWithMultiplier_;
        if (userData.lockEnd > block.timestamp) {
            uint256 lockMultiplier_ = _getSpecificPeriodMultiplier(pool, uint128(block.timestamp), userData.lockEnd);
            amountWithMultiplier_ = (amount_ * lockMultiplier_) / PRECISION;
            newDepositedWithMultiplier_ = (newDeposited_ * lockMultiplier_) / PRECISION;
        } else {
            amountWithMultiplier_ = amount_;
            newDepositedWithMultiplier_ = newDeposited_;
        }

        uint256 pendingRewards_ = _getCurrentUserReward(currentPoolRate_, userData);

        // Update pool data
        poolData.lastUpdate = uint128(block.timestamp);
        poolData.rate = currentPoolRate_;
        poolData.totalDeposited -= amountWithMultiplier_;

        // Update user data
        userData.rate = currentPoolRate_;
        userData.realDeposited = newDeposited_;
        userData.totalDeposited = newDepositedWithMultiplier_;
        userData.pendingRewards = pendingRewards_;

        if (pool.isPublic) {
            totalDepositedInPublicPools -= amount_;

            IERC20(depositToken).safeTransfer(user_, amount_);
        }

        emit UserWithdrawn(poolId_, user_, amount_);
    }

    function _getCurrentUserReward(uint256 currentPoolRate_, UserData memory userData_) private pure returns (uint256) {
        uint256 newRewards_ = ((currentPoolRate_ - userData_.rate) * userData_.totalDeposited) / PRECISION;

        return userData_.pendingRewards + newRewards_;
    }

    function getSpecificPeriodMultiplier(
        uint256 poolId_,
        uint128 startTime_,
        uint128 endTime_
    ) public view returns (uint256) {
        if (!_poolExists(poolId_) || startTime_ > endTime_) {
            return 0;
        }

        return _getSpecificPeriodMultiplier(pools[poolId_], startTime_, endTime_);
    }

    function tanh(uint128 x_) public pure returns (uint256) {
        assert(x_ < uint128(type(int128).max));

        int256 exp_x_ = LogExpMath.exp(int128(x_));
        int256 exp_minus_x = LogExpMath.exp(-int128(x_));

        return uint256(((exp_x_ - exp_minus_x) * int128(DECIMAL)) / (exp_x_ + exp_minus_x));
    }

    function _getSpecificPeriodMultiplier(
        Pool storage pool,
        uint128 startTime_,
        uint128 endTime_
    ) internal view returns (uint256) {
        uint256 maximalMultipier_ = (DECIMAL * 107) / 10;
        uint256 minimalMultipier_ = DECIMAL;

        if (startTime_ <= pool.payoutStart) {
            return PRECISION;
        }

        if (startTime_ >= endTime_) {
            return PRECISION;
        }

        uint256 multipier_ = (POWER_MAX *
            (tanh(2 * (((endTime_ - pool.payoutStart) * DECIMAL) / distributionPeriod)) -
                tanh(2 * (((startTime_ - pool.payoutStart) * DECIMAL) / distributionPeriod)))) / DECIMAL;

        if (multipier_ > maximalMultipier_) {
            multipier_ = maximalMultipier_;
        } else if (multipier_ < minimalMultipier_) {
            multipier_ = minimalMultipier_;
        }

        return (multipier_ * PRECISION) / DECIMAL;
    }

    function _getCurrentPoolRate(uint256 poolId_) private view returns (uint256) {
        PoolData storage poolData = poolsData[poolId_];

        if (poolData.totalDeposited == 0) {
            return poolData.rate;
        }

        uint256 rewards_ = getPeriodReward(poolId_, poolData.lastUpdate, uint128(block.timestamp));

        return poolData.rate + (rewards_ * PRECISION) / poolData.totalDeposited;
    }

    function _poolExists(uint256 poolId_) private view returns (bool) {
        return poolId_ < pools.length;
    }

    /**********************************************************************************************/
    /*** Bridge                                                                                 ***/
    /**********************************************************************************************/

    function overplus() public view returns (uint256) {
        uint256 depositTokenContractBalance_ = IERC20(depositToken).balanceOf(address(this));
        if (depositTokenContractBalance_ <= totalDepositedInPublicPools) {
            return 0;
        }

        return depositTokenContractBalance_ - totalDepositedInPublicPools;
    }

    function bridgeOverplus(
        uint256 gasLimit_,
        uint256 maxFeePerGas_,
        uint256 maxSubmissionCost_
    ) external payable onlyOwner returns (bytes memory) {
        uint256 overplus_ = overplus();
        require(overplus_ > 0, "DS: overplus is zero");

        IERC20(depositToken).safeTransfer(l1Sender, overplus_);

        bytes memory bridgeMessageId_ = L1Sender(l1Sender).sendDepositToken{value: msg.value}(
            gasLimit_,
            maxFeePerGas_,
            maxSubmissionCost_
        );

        emit OverplusBridged(overplus_, bridgeMessageId_);

        return bridgeMessageId_;
    }

    /**********************************************************************************************/
    /*** UUPS                                                                                   ***/
    /**********************************************************************************************/

    function removeUpgradeability() external onlyOwner {
        isNotUpgradeable = true;
    }

    function _authorizeUpgrade(address) internal view override onlyOwner {
        require(!isNotUpgradeable, "DS: upgrade isn't available");
    }
}
