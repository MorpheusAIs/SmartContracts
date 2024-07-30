// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * This is the Builders contract that stores custom builder pools.
 */
interface IBuilders {
    /**
     * The structure that stores the builder pool's data.
     * @param project The name of the project.
     * @param admin The address of the admin.
     * @param poolStart The timestamp when the pool opens.
     * @param withdrawLockPeriodAfterDeposit The period in seconds when the user can't withdraw his deposit after staking.
     * @param claimLockEnd The timestamp when the admin can claim his rewards.
     * @param minimalDeposit The minimal deposit amount.
     */
    struct BuilderPool {
        string name;
        address admin;
        uint128 poolStart;
        uint128 withdrawLockPeriodAfterDeposit;
        uint128 claimLockEnd;
        uint256 minimalDeposit;
    }

    /**
     * The structure that stores the pool's rate data.
     * @param rewardsAtLastUpdate The amount of rewards at the last update.
     * @param rate The current reward rate.
     * @param totalVirtualDeposited The total amount of tokens deposited in the pool with multiplier.
     */
    struct BuilderPoolData {
        uint256 rewardsAtLastUpdate;
        uint256 rate;
        uint256 totalVirtualDeposited;
    }

    /**
     * The structure that stores the user's data of pool.
     * @param lastDeposit The timestamp when the user last deposited tokens.
     * @param deposited The amount of tokens deposited in the pool.
     * @param multiplierLockStart The timestamp when the user locked his tokens.
     */
    struct UserData {
        uint128 lastDeposit;
        uint256 deposited;
        uint128 multiplierLockStart;
    }

    /**
     * The structure that stores the pool's data.
     * @param lastDeposit The timestamp when the user last deposited tokens.
     * @param virtualDeposited The amount of tokens deposited in the pool with user multiplier.
     * @param rate The current reward rate.
     * @param pendingRewards The amount of pending rewards.
     */
    struct BuilderData {
        uint128 lastDeposit;
        uint256 virtualDeposited;
        uint256 rate;
        uint256 pendingRewards;
    }

    /**
     * The event that is emitted when the pool is created.
     * @param builderPoolId The pool's id.
     * @param builderPool The pool's data.
     */
    event BuilderPoolCreated(uint256 indexed builderPoolId, BuilderPool builderPool);

    /**
     * The event that is emitted when the pool is edited.
     * @param builderPoolId The pool's id.
     * @param builderPool The pool's data.
     */
    event BuilderPoolEdited(uint256 indexed builderPoolId, BuilderPool builderPool);

    /**
     * The event that is emitted when the user deposits tokens in the pool.
     * @param builderPool_ The pool's id.
     * @param user The user's address.
     * @param amount The amount of tokens.
     */
    event UserDeposited(uint256 indexed builderPool_, address indexed user, uint256 amount);

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
    event UserLocked(
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
     * The function to deposit tokens in the public pool.
     * @param builderPoolId_ The pool's id.
     * @param amount_ The amount of tokens to deposit.
     */
    function deposit(uint256 builderPoolId_, uint256 amount_) external;

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
}
