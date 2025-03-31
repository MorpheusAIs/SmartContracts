// SPDX-License-Identifier: MIT
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
     * @param withdrawLockPeriodAfterStake The period in seconds when the user can't withdraw his stake after staking.
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
        uint128 withdrawLockPeriodAfterStake;
        uint256 initialReward;
        uint256 rewardDecrease;
        uint256 minimalStake;
        bool isPublic;
    }

    /**
     * The structure that stores the pool's rate data.
     * @param lastUpdate The timestamp when the pool was updated.
     * @param rate The current reward rate.
     * @param totalDeposited The total amount of tokens deposited in the pool.
     */
    struct PoolData {
        uint128 lastUpdate;
        uint256 rate;
        uint256 totalDeposited;
    }

    /**
     * The structure that stores the user's rate data of pool.
     * @param lastStake The timestamp when the user last staked tokens.
     * @param deposited The amount of tokens deposited in the pool.
     * @param rate The current reward rate.
     * @param pendingRewards The amount of pending rewards.
     */
    struct UserData {
        uint128 lastStake;
        uint256 deposited;
        uint256 rate;
        uint256 pendingRewards;
    }

    /**
     * The event that is emitted when the pool is created.
     * @param poolId The pool's id.
     * @param pool The pool's data.
     */
    event PoolCreated(uint256 indexed poolId, Pool pool);

    /**
     * The event that is emitted when the pool is edited.
     * @param poolId The pool's id.
     * @param pool The pool's data.
     */
    event PoolEdited(uint256 indexed poolId, Pool pool);

    /**
     * The event that is emitted when the user stakes tokens in the pool.
     * @param poolId The pool's id.
     * @param user The user's address.
     * @param amount The amount of tokens.
     */
    event UserStaked(uint256 indexed poolId, address indexed user, uint256 amount);

    /**
     * The event that is emitted when the user claims rewards from the pool.
     * @param poolId The pool's id.
     * @param user The user's address.
     * @param receiver The receiver's address.
     * @param amount The amount of tokens.
     */
    event UserClaimed(uint256 indexed poolId, address indexed user, address receiver, uint256 amount);

    /**
     * The event that is emitted when the user withdraws tokens from the pool.
     * @param poolId The pool's id.
     * @param user The user's address.
     * @param amount The amount of tokens.
     */
    event UserWithdrawn(uint256 indexed poolId, address indexed user, uint256 amount);

    /**
     * The event that is emitted when the overplus of the deposit tokens is bridged.
     */
    event OverplusBridged(uint256 amount, bytes uniqueId);

    /**
     * The function to initialize the contract.
     * @param depositToken_ The address of deposit token.
     * @param l1Sender_ The address of bridge contract.
     * @param poolsInfo_ The array of initial pools.
     */
    function Distribution_init(address depositToken_, address l1Sender_, Pool[] calldata poolsInfo_) external;

    /**
     * The function to create a new pool.
     * @param pool_ The pool's data.
     */
    function createPool(Pool calldata pool_) external;

    /**
     * The function to edit the pool's data.
     * @param poolId The pool's id.
     * @param pool_ The new pool's data.
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
     * @param receiver_ The receiver's address.
     */
    function claim(uint256 poolId_, address receiver_) external payable;

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
     * The function to calculate the total overplus of the staked deposit tokens.
     * @return The total overplus amount.
     */
    function overplus() external view returns (uint256);

    /**
     * The function to bridge the overplus of the staked deposit tokens.
     * @param gasLimit_ The gas limit.
     * @param maxFeePerGas_ The max fee per gas.
     * @param maxSubmissionCost_ The max submission cost.
     * @return The unique identifier for withdrawal.
     */
    function bridgeOverplus(
        uint256 gasLimit_,
        uint256 maxFeePerGas_,
        uint256 maxSubmissionCost_
    ) external payable returns (bytes memory);

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
     * The function to get the address of deposit token.
     * @return The address of deposit token.
     */
    function depositToken() external view returns (address);

    /**
     * The function to get the address of bridge contract.
     * @return The address of bridge contract.
     */
    function l1Sender() external view returns (address);

    /**
     * The function to get the amount of deposit tokens that are staked in all of the public pools.
     * @dev The value accumulates the amount amount despite the rate differences.
     * @return The amount of deposit tokens.
     */
    function totalDepositedInPublicPools() external view returns (uint256);
}
