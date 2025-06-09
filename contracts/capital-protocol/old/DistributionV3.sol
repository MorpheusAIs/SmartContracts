// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import {PRECISION} from "@solarity/solidity-lib/utils/Globals.sol";

import {LinearDistributionIntervalDecrease} from "../../libs/LinearDistributionIntervalDecrease.sol";

import {L1Sender} from "../../capital-protocol/old/L1Sender.sol";
import {IDistributionV3} from "../../interfaces/capital-protocol/old/IDistributionV3.sol";

import {LogExpMath} from "../../libs/LogExpMath.sol";

contract DistributionV3 is IDistributionV3, OwnableUpgradeable, UUPSUpgradeable {
    using SafeERC20 for IERC20;

    uint128 constant DECIMAL = 1e18;

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
        uint128[] calldata claimLockEnds_
    ) external onlyOwner poolExists(poolId_) {
        require(!pools[poolId_].isPublic, "DS: pool is public");
        require(users_.length == amounts_.length, "DS: invalid length");
        require(users_.length == claimLockEnds_.length, "DS: invalid length");

        uint256 currentPoolRate_ = _getCurrentPoolRate(poolId_);

        for (uint256 i; i < users_.length; ++i) {
            address user_ = users_[i];
            uint256 amount_ = amounts_[i];

            uint256 deposited_ = usersData[user_][poolId_].deposited;

            if (deposited_ <= amount_) {
                _stake(user_, poolId_, amount_ - deposited_, currentPoolRate_, claimLockEnds_[i]);
            } else {
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
        uint128 claimLockEnd_
    ) external poolExists(poolId_) poolPublic(poolId_) {
        _stake(_msgSender(), poolId_, amount_, _getCurrentPoolRate(poolId_), claimLockEnd_);
    }

    function claim(uint256 poolId_, address receiver_) external payable poolExists(poolId_) {
        address user_ = _msgSender();

        Pool storage pool = pools[poolId_];
        PoolData storage poolData = poolsData[poolId_];
        UserData storage userData = usersData[user_][poolId_];

        require(block.timestamp > pool.payoutStart + pool.claimLockPeriod, "DS: pool claim is locked");
        require(block.timestamp > userData.claimLockEnd, "DS: user claim is locked");

        uint256 currentPoolRate_ = _getCurrentPoolRate(poolId_);
        uint256 pendingRewards_ = _getCurrentUserReward(currentPoolRate_, userData);
        require(pendingRewards_ > 0, "DS: nothing to claim");

        if (userData.virtualDeposited == 0) {
            userData.virtualDeposited = userData.deposited;
        }

        // Update pool data
        poolData.lastUpdate = uint128(block.timestamp);
        poolData.rate = currentPoolRate_;
        poolData.totalVirtualDeposited =
            poolData.totalVirtualDeposited +
            userData.deposited -
            userData.virtualDeposited;

        // Update user data
        userData.rate = currentPoolRate_;
        userData.pendingRewards = 0;
        userData.virtualDeposited = userData.deposited;
        userData.claimLockStart = 0;
        userData.claimLockEnd = 0;

        // Transfer rewards
        L1Sender(l1Sender).sendMintMessage{value: msg.value}(receiver_, pendingRewards_, user_);

        emit UserClaimed(poolId_, user_, receiver_, pendingRewards_);
    }

    function withdraw(uint256 poolId_, uint256 amount_) external poolExists(poolId_) poolPublic(poolId_) {
        _withdraw(_msgSender(), poolId_, amount_, _getCurrentPoolRate(poolId_));
    }

    function lockClaim(uint256 poolId_, uint128 claimLockEnd_) external poolExists(poolId_) {
        require(claimLockEnd_ > block.timestamp, "DS: invalid lock end value (1)");

        address user_ = _msgSender();
        uint256 currentPoolRate_ = _getCurrentPoolRate(poolId_);

        PoolData storage poolData = poolsData[poolId_];
        UserData storage userData = usersData[user_][poolId_];

        require(userData.deposited > 0, "DS: user isn't staked");
        require(claimLockEnd_ > userData.claimLockEnd, "DS: invalid lock end value (2)");

        userData.pendingRewards = _getCurrentUserReward(currentPoolRate_, userData);

        uint128 claimLockStart_ = userData.claimLockStart > 0 ? userData.claimLockStart : uint128(block.timestamp);
        uint256 multiplier_ = _getClaimLockPeriodMultiplier(claimLockStart_, claimLockEnd_);
        uint256 virtualDeposited_ = (userData.deposited * multiplier_) / PRECISION;

        if (userData.virtualDeposited == 0) {
            userData.virtualDeposited = userData.deposited;
        }

        // Update pool data
        poolData.lastUpdate = uint128(block.timestamp);
        poolData.rate = currentPoolRate_;
        poolData.totalVirtualDeposited = poolData.totalVirtualDeposited + virtualDeposited_ - userData.virtualDeposited;

        // Update user data
        userData.rate = currentPoolRate_;
        userData.virtualDeposited = virtualDeposited_;
        userData.claimLockStart = claimLockStart_;
        userData.claimLockEnd = claimLockEnd_;

        emit UserClaimLocked(poolId_, user_, claimLockStart_, claimLockEnd_);
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
        uint128 claimLockEnd_
    ) private {
        Pool storage pool = pools[poolId_];
        PoolData storage poolData = poolsData[poolId_];
        UserData storage userData = usersData[user_][poolId_];

        if (claimLockEnd_ == 0) {
            claimLockEnd_ = userData.claimLockEnd > block.timestamp ? userData.claimLockEnd : uint128(block.timestamp);
        }
        require(claimLockEnd_ >= userData.claimLockEnd, "DS: invalid claim lock end");

        if (pool.isPublic) {
            require(amount_ > 0, "DS: nothing to stake");

            // https://docs.lido.fi/guides/lido-tokens-integration-guide/#steth-internals-share-mechanics
            uint256 balanceBefore_ = IERC20(depositToken).balanceOf(address(this));
            IERC20(depositToken).safeTransferFrom(_msgSender(), address(this), amount_);
            uint256 balanceAfter_ = IERC20(depositToken).balanceOf(address(this));

            amount_ = balanceAfter_ - balanceBefore_;

            require(userData.deposited + amount_ >= pool.minimalStake, "DS: amount too low");

            totalDepositedInPublicPools += amount_;
        }

        userData.pendingRewards = _getCurrentUserReward(currentPoolRate_, userData);

        uint256 deposited_ = userData.deposited + amount_;
        uint256 multiplier_ = _getClaimLockPeriodMultiplier(uint128(block.timestamp), claimLockEnd_);
        uint256 virtualDeposited_ = (deposited_ * multiplier_) / PRECISION;

        if (userData.virtualDeposited == 0) {
            userData.virtualDeposited = userData.deposited;
        }

        // Update pool data
        poolData.lastUpdate = uint128(block.timestamp);
        poolData.rate = currentPoolRate_;
        poolData.totalVirtualDeposited = poolData.totalVirtualDeposited + virtualDeposited_ - userData.virtualDeposited;

        // Update user data
        userData.lastStake = uint128(block.timestamp);
        userData.rate = currentPoolRate_;
        userData.deposited = deposited_;
        userData.virtualDeposited = virtualDeposited_;
        userData.claimLockStart = uint128(block.timestamp);
        userData.claimLockEnd = claimLockEnd_;

        emit UserStaked(poolId_, user_, amount_);
        emit UserClaimLocked(poolId_, user_, uint128(block.timestamp), claimLockEnd_);
    }

    function _withdraw(address user_, uint256 poolId_, uint256 amount_, uint256 currentPoolRate_) private {
        Pool storage pool = pools[poolId_];
        PoolData storage poolData = poolsData[poolId_];
        UserData storage userData = usersData[user_][poolId_];

        uint256 deposited_ = userData.deposited;
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

        userData.pendingRewards = _getCurrentUserReward(currentPoolRate_, userData);

        uint256 multiplier_ = _getClaimLockPeriodMultiplier(uint128(block.timestamp), userData.claimLockEnd);
        uint256 virtualDeposited_ = (newDeposited_ * multiplier_) / PRECISION;

        if (userData.virtualDeposited == 0) {
            userData.virtualDeposited = userData.deposited;
        }

        // Update pool data
        poolData.lastUpdate = uint128(block.timestamp);
        poolData.rate = currentPoolRate_;
        poolData.totalVirtualDeposited = poolData.totalVirtualDeposited + virtualDeposited_ - userData.virtualDeposited;

        // Update user data
        userData.rate = currentPoolRate_;
        userData.deposited = newDeposited_;
        userData.virtualDeposited = virtualDeposited_;
        userData.claimLockStart = uint128(block.timestamp);

        if (pool.isPublic) {
            totalDepositedInPublicPools -= amount_;

            IERC20(depositToken).safeTransfer(user_, amount_);
        }

        emit UserWithdrawn(poolId_, user_, amount_);
    }

    function _getCurrentUserReward(uint256 currentPoolRate_, UserData memory userData_) private pure returns (uint256) {
        uint256 deposited_ = userData_.virtualDeposited == 0 ? userData_.deposited : userData_.virtualDeposited;

        uint256 newRewards_ = ((currentPoolRate_ - userData_.rate) * deposited_) / PRECISION;

        return userData_.pendingRewards + newRewards_;
    }

    function _getCurrentPoolRate(uint256 poolId_) private view returns (uint256) {
        PoolData storage poolData = poolsData[poolId_];

        if (poolData.totalVirtualDeposited == 0) {
            return poolData.rate;
        }

        uint256 rewards_ = getPeriodReward(poolId_, poolData.lastUpdate, uint128(block.timestamp));

        return poolData.rate + (rewards_ * PRECISION) / poolData.totalVirtualDeposited;
    }

    function _poolExists(uint256 poolId_) private view returns (bool) {
        return poolId_ < pools.length;
    }

    /**********************************************************************************************/
    /*** Claim lock multiplier                                                                  ***/
    /**********************************************************************************************/

    function getClaimLockPeriodMultiplier(
        uint256 poolId_,
        uint128 claimLockStart_,
        uint128 claimLockEnd_
    ) public view returns (uint256) {
        if (!_poolExists(poolId_)) {
            return PRECISION;
        }

        return _getClaimLockPeriodMultiplier(claimLockStart_, claimLockEnd_);
    }

    function getCurrentUserMultiplier(uint256 poolId_, address user_) public view returns (uint256) {
        if (!_poolExists(poolId_)) {
            return PRECISION;
        }

        UserData storage userData = usersData[user_][poolId_];

        return _getClaimLockPeriodMultiplier(userData.claimLockStart, userData.claimLockEnd);
    }

    /**
     * @dev tahn(x) = (e^x - e^(-x)) / (e^x + e^(-x))
     */
    function _tanh(uint128 x_) private pure returns (uint256) {
        int256 exp_x_ = LogExpMath.exp(int128(x_));
        int256 exp_minus_x = LogExpMath.exp(-int128(x_));

        return uint256(((exp_x_ - exp_minus_x) * int128(DECIMAL)) / (exp_x_ + exp_minus_x));
    }

    function _getClaimLockPeriodMultiplier(uint128 start_, uint128 end_) internal pure returns (uint256) {
        uint256 powerMax = 16_613_275_460_000_000_000; // 16.61327546 * DECIMAL

        uint256 maximalMultiplier_ = 10_700_000_000_000_000_000; // 10.7 * DECIMAL
        uint256 minimalMultiplier_ = DECIMAL; // 1 * DECIMAL

        uint128 periodStart_ = 1721908800; // Thu, 25 Jul 2024 12:00:00 UTC
        uint128 periodEnd_ = 2211192000; // Thu, 26 Jan 2040 12:00:00 UTC TODO
        uint128 distributionPeriod = periodEnd_ - periodStart_;

        end_ = end_ > periodEnd_ ? periodEnd_ : end_;
        start_ = start_ < periodStart_ ? periodStart_ : start_;

        if (start_ >= end_) {
            return PRECISION;
        }

        uint256 endPower_ = _tanh(2 * (((end_ - periodStart_) * DECIMAL) / distributionPeriod));
        uint256 startPower_ = _tanh(2 * (((start_ - periodStart_) * DECIMAL) / distributionPeriod));
        uint256 multiplier_ = (powerMax * (endPower_ - startPower_)) / DECIMAL;

        multiplier_ = multiplier_ > maximalMultiplier_ ? maximalMultiplier_ : multiplier_;
        multiplier_ = multiplier_ < minimalMultiplier_ ? minimalMultiplier_ : multiplier_;

        return (multiplier_ * PRECISION) / DECIMAL;
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

    function version() external pure returns (uint256) {
        return 3;
    }

    function _authorizeUpgrade(address) internal view override onlyOwner {
        require(!isNotUpgradeable, "DS: upgrade isn't available");
    }
}
