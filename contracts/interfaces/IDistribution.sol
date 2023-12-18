// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

/**
 * This is Distribution contract that stores all the pools and users data.
 * It is used to calculate the user's rewards and operate with overpluses.
 */
interface IDistribution {
    /**
     * The structure that stores the core pool's data.
     * @param payoutStart The timestamp when the pool starts to pay out rewards.
     * @param decreaseInterval The interval in seconds between reward decreases.
     * @param withdrawLockPeriod The period in seconds when the user can't withdraw his stake.
     * @param claimLockPeriod The period in seconds when the user can't claim his rewards.
     * @param initialReward The initial reward per interval.
     * @param rewardDecrease The reward decrease per interval.
     * @param minimalStake The minimal stake amount.
     * @param isPublic The flag that indicates if the pool is public.
     */
    struct Pool {
        uint128 payoutStart;
        uint128 decreaseInterval;
        uint128 withdrawLockPeriod;
        uint128 claimLockPeriod;
        uint256 initialReward;
        uint256 rewardDecrease;
        uint256 minimalStake;
        bool isPublic;
    }

    /**
     * The structure that stores the pool's rate data.
     * @param lastUpdate The timestamp when the pool was updated.
     * @param rate The current reward rate.
     * @param totalInvested The total amount of tokens invested in the pool.
     */
    struct PoolData {
        uint128 lastUpdate;
        uint256 rate;
        uint256 totalInvested;
    }

    /**
     * The structure that stores the user's rate data of pool.
     * @param invested The amount of tokens invested in the pool.
     * @param rate The current reward rate.
     * @param pendingRewards The amount of pending rewards.
     */
    struct UserData {
        uint256 invested;
        uint256 rate;
        uint256 pendingRewards;
    }

    event Staked(address user, uint256 poolId, uint256 amount, uint256 userStakeTotal, bool isStaked);

    /**
     * The function to initialize the contract.
     * @param investToken_ The address of invest token.
     * @param l1Sender_ The address of bridge contract.
     * @param poolsInfo_ The array of initial pools.
     */
    function Distribution_init(address investToken_, address l1Sender_, Pool[] calldata poolsInfo_) external;

    /**
     * The function to create a new pool.
     * @param pool_ The pool's data.
     */
    function createPool(Pool calldata pool_) external;

    /**
     * The function to edit the pool's data.
     * @param poolId The pool's id.
     * @param pool_ The new     pool's data.
     */
    function editPool(uint256 poolId, Pool calldata pool_) external;

    /**
     * The function to calculate the total pool's reward for the specified period.
     * @param poolId_ The pool's id.
     * @param startTime_ The start timestamp.
     * @param endTime_ The end timestamp.
     * @return The total reward amount.
     */
    function getPeriodReward(uint256 poolId_, uint128 startTime_, uint128 endTime_) external view returns (uint256);

    /**
     * The function to manage users and their rate in the private pool.
     * @param poolId_ The pool's id.
     * @param users_ The array of users.
     * @param amounts_ The array of amounts.
     */
    function manageUsersInPrivatePool(uint256 poolId_, address[] calldata users_, uint256[] calldata amounts_) external;

    /**
     * The function to stake tokens in the public pool.
     * @param poolId_ The pool's id.
     * @param amount_ The amount of tokens to stake.
     */
    function stake(uint256 poolId_, uint256 amount_) external;

    /**
     * The function to claim rewards from the pool.
     * @param poolId_ The pool's id.
     * @param user_ The user's address.
     */
    function claim(uint256 poolId_, address user_) external;

    /**
     * The function to withdraw tokens from the pool.
     * @param poolId_ The pool's id.
     * @param amount_ The amount of tokens to withdraw.
     */
    function withdraw(uint256 poolId_, uint256 amount_) external;

    /**
     * The function to get the user's reward for the specified pool.
     * @param poolId_ The pool's id.
     * @param user_ The user's address.
     * @return The user's reward amount.
     */
    function getCurrentUserReward(uint256 poolId_, address user_) external view returns (uint256);

    /**
     * The function to calculate the total overplus of the staked invest tokens.
     * @return The total overplus amount.
     */
    function overplus() external view returns (uint256);

    /**
     * The function to bridge the overplus of the staked invest tokens.
     * @param recipient_ The recipient's address.
     * @param gasLimit_ The gas limit.
     * @param maxFeePerGas_ The max fee per gas.
     * @param maxSubmissionCost_ The max submission cost.
     */
    function bridgeOverplus(
        address recipient_,
        uint256 gasLimit_,
        uint256 maxFeePerGas_,
        uint256 maxSubmissionCost_
    ) external;

    /**
     * The function to remove upgradeability.
     */
    function removeUpgradeability() external;

    /**
     * The function to check if the contract is upgradeable.
     * @return The flag that indicates if the contract is upgradeable.
     */
    function isNotUpgradeable() external view returns (bool);

    /**
     * The function to get the address of invest token.
     * @return The address of invest token.
     */
    function investToken() external view returns (address);

    /**
     * The function to get the amount of invest tokens that are staked in the pool.
     * @dev The value accumulates the amount amount despite the rate differences.
     * @return The amount of invest tokens.
     */
    function totalInvestedInPublicPools() external view returns (uint256);
}
