// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * This is the Builders contract that stores custom builder pools.
 */
interface IBuilders {
    /**
     * The structure that stores the builder pool's data.
     * @param project The address of the project.
     * @param admin The address of the admin.
     * @param poolStart The timestamp when the pool opens.
     * @param withdrawLockPeriodAfterStake The period in seconds when the user can't withdraw his stake after staking.
     * @param minimalStake The minimal stake amount.
     */
    struct BuilderPool {
        address project;
        address admin;
        uint128 poolStart;
        uint128 withdrawLockPeriodAfterStake;
        uint256 minimalStake;
    }

    /**
     * The structure that stores the user's data of pool.
     * @param lastStake The timestamp when the user last staked tokens.
     * @param deposited The amount of tokens deposited in the pool.
     * @param withdrawLockStart The timestamp when the user locked his tokens.
     * @param withdrawLockEnd The timestamp when the user can withdraw his tokens.
     */
    struct UserData {
        uint128 lastStake;
        uint256 deposited;
        uint128 withdrawLockStart;
        uint128 withdrawLockEnd;
    }

    /**
     * The structure that stores the pool's data.
     * @param lastStake The timestamp when the user last staked tokens.
     * @param virtualDeposited The amount of tokens deposited in the pool with user multiplier.
     * @param rate The current reward rate.
     * @param pendingRewards The amount of pending rewards.
     */
    struct BuilderData {
        uint128 lastStake;
        uint256 virtualDeposited;
        uint256 rate;
        uint256 pendingRewards;
    }

    /**
     * The event that is emitted when the distribution is set.
     * @param distribution The address of the distribution contract.
     * @param poolId The pool's id.
     */
    event DistrutionSet(address distribution, uint256 poolId);

    /**
     * The event that is emitted when the pool is created.
     * @param builderPoolId The pool's id.
     * @param builderPool The pool's data.
     */
    event PoolCreated(uint256 indexed builderPoolId, BuilderPool builderPool);

    /**
     * The event that is emitted when the pool is edited.
     * @param builderPoolId The pool's id.
     * @param builderPool The pool's data.
     */
    event PoolEdited(uint256 indexed builderPoolId, BuilderPool builderPool);

    /**
     * The event that is emitted when the user stakes tokens in the pool.
     * @param builderPool_ The pool's id.
     * @param user The user's address.
     * @param amount The amount of tokens.
     */
    event UserStaked(uint256 indexed builderPool_, address indexed user, uint256 amount);

    /**
     * The event that is emitted when the admin claims rewards from the pool.
     * @param builderPool_ The pool's id.
     * @param receiver The receiver's address.
     * @param amount The amount of tokens.
     */
    event AdminClaimed(uint256 indexed builderPool_, address receiver, uint256 amount);

    /**
     * The event that is emitted when the user withdraws tokens from the pool.
     * @param builderPool_ The pool's id.
     * @param user The user's address.
     * @param amount The amount of tokens.
     */
    event UserWithdrawn(uint256 indexed builderPool_, address indexed user, uint256 amount);

    /**
     * The event that is emitted when the user locks his tokens.
     * @param builderPool_ The pool's id.
     * @param user The user's address.
     * @param withdrawLockStart The timestamp when the user locked his tokens.
     * @param withdrawLockEnd The timestamp when the user can withdraw his tokens.
     */
    event UserWithdrawLocked(
        uint256 indexed builderPool_,
        address indexed user,
        uint128 withdrawLockStart,
        uint128 withdrawLockEnd
    );

    /**
     * The event that is emitted when the fee is paid.
     * @param user The payer's address.
     * @param operation The operation name.
     * @param amount The amount of tokens.
     * @param treasury The treasury address.
     */
    event FeePaid(address indexed user, string indexed operation, uint256 amount, address treasury);

    /**
     * The function to create a new pool.
     * @param builderPool_ The pool's data.
     */
    function createBuilderPool(BuilderPool calldata builderPool_) external;

    /**
     * The function to edit the pool's data.
     * @param builderPoolId_ The pool's id.
     * @param builderPool_ The new pool's data.
     */
    function editBuilderPool(uint256 builderPoolId_, BuilderPool calldata builderPool_) external;

    /**
     * The function to stake tokens in the public pool.
     * @param builderPoolId_ The pool's id.
     * @param amount_ The amount of tokens to stake.
     * @param withdrawLockEnd_ The timestamp when the user can withdraw tokens.
     */
    function stake(uint256 builderPoolId_, uint256 amount_, uint128 withdrawLockEnd_) external;

    /**
     * The function to claim rewards from the pool.
     * @param builderPoolId_ The pool's id.
     * @param receiver_ The receiver's address.
     */
    function claim(uint256 builderPoolId_, address receiver_) external;

    /**
     * The function to withdraw tokens from the pool.
     * @param builderPoolId_ The pool's id.
     * @param amount_ The amount of tokens to withdraw.
     */
    function withdraw(uint256 builderPoolId_, uint256 amount_) external;

    /**
     * The function to lock the user's tokens.
     * @param builderPoolId_ The pool's id.
     * @param withdrawLockEnd_ The timestamp when the user can withdraw his tokens.
     */
    function lockWithdraw(uint256 builderPoolId_, uint128 withdrawLockEnd_) external;

    /**
     * The function to get the builder's reward.
     * @param builderPoolId_ The pool's id.
     * @return The user's reward amount.
     */
    function getCurrentBuilderReward(uint256 builderPoolId_) external view returns (uint256);

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
     * The function to get the amount of deposit tokens that is staked.
     * @return The amount of deposit tokens.
     */
    function totalDeposited() external view returns (uint256);
}
