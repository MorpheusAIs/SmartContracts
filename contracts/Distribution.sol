// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {PRECISION} from "@solarity/solidity-lib/utils/Globals.sol";

import {LinearDistributionIntervalDecrease} from "./libs/LinearDistributionIntervalDecrease.sol";
import {IDistribution} from "./interfaces/IDistribution.sol";
import {Swap} from "./Swap.sol";
import {MOR} from "./tokens/MOR.sol";

contract Distribution is IDistribution, OwnableUpgradeable, UUPSUpgradeable {
    using SafeERC20 for IERC20;
    using SafeERC20 for MOR;

    bool public isNotUpgradeable;

    address public rewardToken;
    address public investToken;
    address public swap;

    // Pool storage
    Pool[] public pools;
    mapping(uint256 => PoolData) public poolsData;

    // User storage
    mapping(address => mapping(uint256 => UserData)) public usersData;

    // Total rewards storage
    uint256 public totalETHStaked;

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

    function getPeriodReward(
        uint256 poolId_,
        uint128 startTime_,
        uint128 endTime_
    ) public view returns (uint256) {
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
            } else {
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
        require(
            block.timestamp > pool.payoutStart + pool.withdrawLockPeriod,
            "DS: pool claim is locked"
        );

        uint256 currentPoolRate_ = _getCurrentPoolRate(poolId_);
        uint256 pendingRewards_ = _getCurrentUserReward(currentPoolRate_, userData);
        require(pendingRewards_ > 0, "DS: nothing to claim");

        // Update pool data
        poolData.lastUpdate = uint128(block.timestamp);
        poolData.rate = currentPoolRate_;

        // Update user data
        userData.rate = currentPoolRate_;
        userData.pendingRewards = 0;

        // Transfer rewards
        MOR(rewardToken).mint(user_, pendingRewards_);
    }

    function withdraw(uint256 poolId_, uint256 amount_) external poolExists(poolId_) {
        require(pools[poolId_].isPublic, "DS: pool isn't public");

        _withdraw(_msgSender(), poolId_, amount_, _getCurrentPoolRate(poolId_));
    }

    function burnOverplus(uint256 amountOutMin_) external onlyOwner {
        uint256 overplus_ = overplus();
        require(overplus_ > 0, "DS: nothing to burn");

        Swap(swap).swapStETHForMor(overplus_, amountOutMin_);

        MOR(rewardToken).burn(MOR(rewardToken).balanceOf(address(this)));
    }

    function overplus() public view returns (uint256) {
        uint256 currentETHBalance = IERC20(investToken).balanceOf(address(this));
        if (currentETHBalance <= totalETHStaked) {
            return 0;
        }

        return currentETHBalance - totalETHStaked;
    }

    function getCurrentUserReward(uint256 poolId_, address user_) external view returns (uint256) {
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
        uint256 currentPoolRate_
    ) internal {
        require(amount_ > 0, "DS: nothing to stake");

        Pool storage pool = pools[poolId_];
        PoolData storage poolData = poolsData[poolId_];
        UserData storage userData = usersData[user_][poolId_];

        if (pool.isPublic) {
            require(userData.invested + amount_ >= pool.minimalStake, "DS: amount too low");

            totalETHStaked += amount_;

            IERC20(investToken).safeTransferFrom(_msgSender(), address(this), amount_);
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

    function _withdraw(
        address user_,
        uint256 poolId_,
        uint256 amount_,
        uint256 currentPoolRate_
    ) internal {
        Pool storage pool = pools[poolId_];
        PoolData storage poolData = poolsData[poolId_];
        UserData storage userData = usersData[user_][poolId_];

        uint256 invested_ = userData.invested;
        require(invested_ > 0, "DS: user isn't staked");

        if (amount_ > invested_) {
            amount_ = invested_;
        }
        uint256 newInvested_ = invested_ - amount_;
        if (pool.isPublic) {
            require(
                newInvested_ >= pool.minimalStake || newInvested_ == 0,
                "DS: invalid withdraw amount"
            );
        }

        uint256 pendingRewards_ = _getCurrentUserReward(currentPoolRate_, userData);

        // Update pool data
        poolData.lastUpdate = uint128(block.timestamp);
        poolData.rate = currentPoolRate_;
        poolData.totalInvested -= amount_;

        // Update user data
        userData.rate = currentPoolRate_;
        userData.invested = newInvested_;

        MOR(rewardToken).mint(user_, pendingRewards_);
        if (pool.isPublic) {
            totalETHStaked -= amount_;
            IERC20(investToken).safeTransfer(user_, amount_);
        }
    }

    function _getCurrentUserReward(
        uint256 currentPoolRate_,
        UserData memory userData_
    ) internal pure returns (uint256) {
        uint256 newRewards_ = ((currentPoolRate_ - userData_.rate) * userData_.invested) /
            PRECISION;

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
    /*** UUPS                                                                                   ***/
    /**********************************************************************************************/
    function removeUpgradeability() external onlyOwner {
        isNotUpgradeable = true;
    }

    function _authorizeUpgrade(address) internal view override onlyOwner {
        require(!isNotUpgradeable, "DS: upgrade isn't available");
    }
}
