// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {PRECISION} from "@solarity/solidity-lib/utils/Globals.sol";

import {LinearDistributionIntervalDecrease} from "./libs/LinearDistributionIntervalDecrease.sol";

import {IDistribution} from "./interfaces/IDistribution.sol";
import {ISwap} from "./interfaces/ISwap.sol";
import {IMOR} from "./interfaces/IMOR.sol";

contract Distribution is IDistribution, OwnableUpgradeable, UUPSUpgradeable {
    using SafeERC20 for IERC20;

    bool public isNotUpgradeable;

    address public rewardToken;
    address public investToken;
    address public swap;

    // Pool storage
    Pool[] public pools;
    mapping(uint256 => PoolData) public poolsData;

    // User storage
    mapping(address => mapping(uint256 => UserData)) public usersData;

    // Total invested storage
    uint256 public totalInvestedInPublicPools;

    /**********************************************************************************************/
    /*** Modifiers                                                                              ***/
    /**********************************************************************************************/
    modifier poolExists(uint256 poolId_) {
        require(_poolExists(poolId_), "DS: pool doesn't exist");
        _;
    }

    /**********************************************************************************************/
    /*** Init                                                                                   ***/
    /**********************************************************************************************/
    function Distribution_init(
        address rewardToken_,
        address investToken_,
        address swap_,
        Pool[] calldata poolsInfo_
    ) external initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();

        require(IMOR(rewardToken_).supportsInterface(type(IMOR).interfaceId), "DS: invalid reward token");
        require(ISwap(swap_).supportsInterface(type(ISwap).interfaceId), "DS: invalid swap contract");

        for (uint256 i = 0; i < poolsInfo_.length; i++) {
            createPool(poolsInfo_[i]);
        }

        IERC20(investToken_).approve(swap_, type(uint256).max);

        rewardToken = rewardToken_;
        investToken = investToken_;
        swap = swap_;
    }

    /**********************************************************************************************/
    /*** Pool managment and data retrieval                                                      ***/
    /**********************************************************************************************/
    function createPool(Pool calldata pool_) public onlyOwner {
        require(pool_.payoutStart > block.timestamp, "DS: invalid payout start value");

        _validatePool(pool_);
        pools.push(pool_);
    }

    function editPool(uint256 poolId_, Pool calldata pool_) external onlyOwner poolExists(poolId_) {
        _validatePool(pool_);

        PoolData storage poolData = poolsData[poolId_];
        uint256 currentPoolRate_ = _getCurrentPoolRate(poolId_);

        // Update pool data
        poolData.rate = currentPoolRate_;
        poolData.lastUpdate = uint128(block.timestamp);

        pools[poolId_] = pool_;
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

    function _validatePool(Pool calldata pool_) internal pure {
        if (pool_.rewardDecrease > 0) {
            require(pool_.decreaseInterval > 0, "DS: invalid reward decrease");
        }
    }

    /**********************************************************************************************/
    /*** User management in private pools                                                       ***/
    /**********************************************************************************************/
    function manageUsersInPrivatePool(
        uint256 poolId_,
        address[] calldata users_,
        uint256[] calldata amounts_
    ) external onlyOwner poolExists(poolId_) {
        require(!pools[poolId_].isPublic, "DS: pool is public");
        require(users_.length == amounts_.length, "DS: invalid length");

        uint256 currentPoolRate_ = _getCurrentPoolRate(poolId_);

        for (uint256 i = 0; i < users_.length; i++) {
            address user_ = users_[i];
            uint256 amount_ = amounts_[i];

            uint256 invested_ = usersData[user_][poolId_].invested;

            if (invested_ < amount_) {
                _stake(user_, poolId_, amount_ - invested_, currentPoolRate_);
            } else if (invested_ > amount_) {
                _withdraw(user_, poolId_, invested_ - amount_, currentPoolRate_);
            }
        }
    }

    /**********************************************************************************************/
    /*** Stake, claim, withdraw                                                                 ***/
    /**********************************************************************************************/
    function stake(uint256 poolId_, uint256 amount_) external poolExists(poolId_) {
        require(pools[poolId_].isPublic, "DS: pool isn't public");

        _stake(_msgSender(), poolId_, amount_, _getCurrentPoolRate(poolId_));
    }

    function claim(uint256 poolId_, address user_) external poolExists(poolId_) {
        Pool storage pool = pools[poolId_];
        PoolData storage poolData = poolsData[poolId_];
        UserData storage userData = usersData[user_][poolId_];

        require(userData.invested > 0, "DS: user isn't staked");
        require(block.timestamp > pool.payoutStart + pool.claimLockPeriod, "DS: pool claim is locked");

        uint256 currentPoolRate_ = _getCurrentPoolRate(poolId_);
        uint256 pendingRewards_ = _getCurrentUserReward(currentPoolRate_, userData);
        require(pendingRewards_ > 0, "DS: nothing to claim");

        // Update pool data
        poolData.lastUpdate = uint128(block.timestamp);
        poolData.rate = currentPoolRate_;

        // Update user data
        userData.rate = currentPoolRate_;

        // Transfer rewards
        uint256 mintedAmount_ = _mintUserRewards(user_, pendingRewards_);
        userData.pendingRewards = pendingRewards_ - mintedAmount_;
    }

    function withdraw(uint256 poolId_, uint256 amount_) external poolExists(poolId_) {
        require(pools[poolId_].isPublic, "DS: pool isn't public");

        _withdraw(_msgSender(), poolId_, amount_, _getCurrentPoolRate(poolId_));
    }

    function getCurrentUserReward(uint256 poolId_, address user_) external view returns (uint256) {
        if (!_poolExists(poolId_)) {
            return 0;
        }

        UserData storage userData = usersData[user_][poolId_];
        uint256 currentPoolRate_ = _getCurrentPoolRate(poolId_);

        return _getCurrentUserReward(currentPoolRate_, userData);
    }

    function _stake(address user_, uint256 poolId_, uint256 amount_, uint256 currentPoolRate_) internal {
        require(amount_ > 0, "DS: nothing to stake");

        Pool storage pool = pools[poolId_];
        PoolData storage poolData = poolsData[poolId_];
        UserData storage userData = usersData[user_][poolId_];

        if (pool.isPublic) {
            // https://docs.lido.fi/guides/lido-tokens-integration-guide/#steth-internals-share-mechanics
            uint256 balanceBefore_ = IERC20(investToken).balanceOf(address(this));
            IERC20(investToken).safeTransferFrom(_msgSender(), address(this), amount_);
            uint256 balanceAfter_ = IERC20(investToken).balanceOf(address(this));

            amount_ = balanceAfter_ - balanceBefore_;

            require(userData.invested + amount_ >= pool.minimalStake, "DS: amount too low");

            totalInvestedInPublicPools += amount_;
        }

        userData.pendingRewards = _getCurrentUserReward(currentPoolRate_, userData);

        // Update pool data
        poolData.lastUpdate = uint128(block.timestamp);
        poolData.rate = currentPoolRate_;
        poolData.totalInvested += amount_;

        // Update user data
        userData.rate = currentPoolRate_;
        userData.invested += amount_;
    }

    function _withdraw(address user_, uint256 poolId_, uint256 amount_, uint256 currentPoolRate_) internal {
        Pool storage pool = pools[poolId_];
        PoolData storage poolData = poolsData[poolId_];
        UserData storage userData = usersData[user_][poolId_];

        uint256 invested_ = userData.invested;
        require(invested_ > 0, "DS: user isn't staked");

        if (amount_ > invested_) {
            amount_ = invested_;
        }

        uint256 newInvested_;
        if (pool.isPublic) {
            require(
                block.timestamp < pool.payoutStart || block.timestamp > pool.payoutStart + pool.withdrawLockPeriod,
                "DS: pool withdraw is locked"
            );

            uint256 investTokenContractBalance = IERC20(investToken).balanceOf(address(this));
            if (amount_ > investTokenContractBalance) {
                amount_ = investTokenContractBalance;
            }

            newInvested_ = invested_ - amount_;

            require(
                amount_ > 0 && (newInvested_ >= pool.minimalStake || newInvested_ == 0),
                "DS: invalid withdraw amount"
            );
        } else {
            newInvested_ = invested_ - amount_;
        }

        uint256 pendingRewards_ = _getCurrentUserReward(currentPoolRate_, userData);

        // Update pool data
        poolData.lastUpdate = uint128(block.timestamp);
        poolData.rate = currentPoolRate_;
        poolData.totalInvested -= amount_;

        // Update user data
        userData.rate = currentPoolRate_;
        userData.invested -= amount_;

        uint256 mintedAmount_ = _mintUserRewards(user_, pendingRewards_);
        userData.pendingRewards = pendingRewards_ - mintedAmount_;

        if (pool.isPublic) {
            totalInvestedInPublicPools -= amount_;

            IERC20(investToken).safeTransfer(user_, amount_);
        }
    }

    function _mintUserRewards(address user_, uint256 amount_) internal returns (uint256) {
        uint256 maxAmount_ = IMOR(rewardToken).cap() - IMOR(rewardToken).totalSupply();

        if (amount_ == 0 || maxAmount_ == 0) {
            return 0;
        } else if (amount_ > maxAmount_) {
            amount_ = maxAmount_;
        }

        IMOR(rewardToken).mint(user_, amount_);

        return amount_;
    }

    function _getCurrentUserReward(
        uint256 currentPoolRate_,
        UserData memory userData_
    ) internal pure returns (uint256) {
        uint256 newRewards_ = ((currentPoolRate_ - userData_.rate) * userData_.invested) / PRECISION;

        return userData_.pendingRewards + newRewards_;
    }

    function _getCurrentPoolRate(uint256 poolId_) internal view returns (uint256) {
        PoolData storage poolData = poolsData[poolId_];

        if (poolData.totalInvested == 0) {
            return poolData.rate;
        }

        uint256 rewards_ = getPeriodReward(poolId_, poolData.lastUpdate, uint128(block.timestamp));

        return poolData.rate + (rewards_ * PRECISION) / poolData.totalInvested;
    }

    function _poolExists(uint256 poolId_) internal view returns (bool) {
        return poolId_ < pools.length;
    }

    /**********************************************************************************************/
    /*** Swap                                                                                   ***/
    /**********************************************************************************************/

    function overplus() public view returns (uint256) {
        uint256 investTokenContractBalance = IERC20(investToken).balanceOf(address(this));
        if (investTokenContractBalance <= totalInvestedInPublicPools) {
            return 0;
        }

        return investTokenContractBalance - totalInvestedInPublicPools;
    }

    function swapAndBurnOverplus(uint256 amountOutMin_) external onlyOwner {
        uint256 overplus_ = overplus();
        require(overplus_ > 0, "DS: overplus is zero");

        ISwap(swap).swap(overplus_, amountOutMin_);

        IMOR(rewardToken).burn(IMOR(rewardToken).balanceOf(address(this)));
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
