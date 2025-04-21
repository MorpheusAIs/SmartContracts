// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

/**
 * This is the Builders contract that stores custom builder pools.
 */
interface IBuildersV3 is IERC165 {
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
     * @param distributedRewards The amount of rewards at the last update.
     * @param rate The current reward rate.
     * @param totalDeposited The total amount of tokens deposited in the pool without multiplier.
     * @param totalVirtualDeposited The total amount of tokens deposited in the pool with multiplier.
     */
    struct TotalPoolData {
        uint256 distributedRewards;
        uint256 rate;
        uint256 totalDeposited;
        uint256 totalVirtualDeposited;
    }

    /**
     * The structure that stores the user's data of pool.
     * @param lastDeposit The timestamp when the user last deposited tokens.
     * @param claimLockStart The timestamp when the user locked his tokens.
     * @param deposited The amount of tokens deposited in the pool.
     * @param virtualDeposited The amount of tokens deposited in the pool with user multiplier.
     */
    struct UserData {
        uint128 lastDeposit;
        uint128 claimLockStart;
        uint256 deposited;
        uint256 virtualDeposited;
    }

    /**
     * The structure that stores the pool's data.
     * @param lastDeposit The timestamp when the user last deposited tokens.
     * @param deposited The amount of tokens deposited in the pool without users multiplier.
     * @param virtualDeposited The amount of tokens deposited in the pool with users multiplier.
     * @param rate The current reward rate.
     * @param pendingRewards The amount of pending rewards.
     */
    struct BuilderPoolData {
        uint128 lastDeposit;
        uint256 deposited;
        uint256 virtualDeposited;
        uint256 rate;
        uint256 pendingRewards;
    }

    /**
     * The event that is emitted when the fee config is set.
     * @param feeConfig The address of the fee config.
     */
    event FeeConfigSet(address feeConfig);

    /**
     * The event that is emitted when the builders treasury address is set.
     * @param buildersTreasury The address of the builders treasury.
     */
    event BuildersTreasurySet(address buildersTreasury);

    /**
     * The event that is emitted when the minimal withdraw lock period is set.
     * @param minimalWithdrawLockPeriod The minimal withdraw lock period.
     */
    event MinimalWithdrawLockPeriodSet(uint256 minimalWithdrawLockPeriod);

    /**
     * The event that is emitted when the deadline for editing the pool is set.
     * @param editPoolDeadline The deadline for editing the pool.
     */
    event EditPoolDeadlineSet(uint128 editPoolDeadline);

    /**
     * The event that is emitted when the pool is created.
     * @param builderPoolId The pool's id.
     * @param builderPool The pool's data.
     */
    event BuilderPoolCreated(bytes32 indexed builderPoolId, BuilderPool builderPool);

    /**
     * The event that is emitted when the pool is edited.
     * @param builderPoolId The pool's id.
     * @param builderPool The pool's data.
     */
    event BuilderPoolEdited(bytes32 indexed builderPoolId, BuilderPool builderPool);

    /**
     * The event that is emitted when the user deposits tokens in the pool.
     * @param builderPool The pool's id.
     * @param user The user's address.
     * @param amount The amount of tokens.
     */
    event UserDeposited(bytes32 indexed builderPool, address indexed user, uint256 amount);

    /**
     * The event that is emitted when the admin claims rewards from the pool.
     * @param builderPool The pool's id.
     * @param receiver The receiver's address.
     * @param amount The amount of tokens.
     */
    event AdminClaimed(bytes32 indexed builderPool, address receiver, uint256 amount);

    /**
     * The event that is emitted when the user withdraws tokens from the pool.
     * @param builderPool The pool's id.
     * @param user The user's address.
     * @param amount The amount of tokens.
     */
    event UserWithdrawn(bytes32 indexed builderPool, address indexed user, uint256 amount);

    /**
     * The event that is emitted when the fee is paid.
     * @param user The payer's address.
     * @param operation The operation name.
     * @param amount The amount of tokens.
     * @param treasury The treasury address.
     */
    event FeePaid(address indexed user, bytes32 indexed operation, uint256 amount, address treasury);

    /**
     * The event that is emitted when the user migrated to the new contract.
     * @param builderPoolId The pool's id.
     * @param user The user's address.
     */
    event UserMigrated(bytes32 indexed builderPoolId, address indexed user);

    /**
     * The event that is emitted when the migration owner set.
     * @param migrationOwner The new migration owner.
     */
    event MigrationOwnerSet(address migrationOwner);

    /**
     * The event that is emitted when the BuilderSubnets contract set.
     * @param builderSubnets The new BuilderSubnets contract.
     */
    event BuilderSubnetsSet(address builderSubnets);

    /**
     * The event that is emitted when the `isPaused` set.
     * @param isPaused The new value.
     */
    event IsPausedSet(bool isPaused);

    /**
     * The event that is emitted when the `isPausedForMigration` set.
     * @param isPausedForMigration The new value.
     */
    event IsPausedForMigrationSet(bool isPausedForMigration);

    /**
     * The function to set the fee config address.
     * @param feeConfig_ The address of the fee config.
     */
    function setFeeConfig(address feeConfig_) external;

    /**
     * The function to set the builders treasury address.
     * @param buildersTreasury_ The address of the builders treasury.
     */
    function setBuildersTreasury(address buildersTreasury_) external;

    /**
     * The function to set the deadline for editing the pool.
     * @param editPoolDeadline_ The deadline for editing the pool.
     */
    function setEditPoolDeadline(uint128 editPoolDeadline_) external;

    /**
     * The function to set the minimal withdraw lock period.
     * @param minimalWithdrawLockPeriod_ The minimal withdraw lock period.
     */
    function setMinimalWithdrawLockPeriod(uint256 minimalWithdrawLockPeriod_) external;

    /**
     * The function to create a new pool.
     * @param builderPool_ The pool's data.
     */
    function createBuilderPool(BuilderPool calldata builderPool_) external;

    /**
     * The function to edit the pool's data.
     * @param builderPool_ The new pool's data.
     */
    function editBuilderPool(BuilderPool calldata builderPool_) external;

    /**
     * The function to deposit tokens in the public pool.
     * @param builderPoolId_ The pool's id.
     * @param amount_ The amount of tokens to deposit.
     */
    function deposit(bytes32 builderPoolId_, uint256 amount_) external;

    /**
     * The function to withdraw tokens from the pool.
     * @param builderPoolId_ The pool's id.
     * @param amount_ The amount of tokens to withdraw.
     */
    function withdraw(bytes32 builderPoolId_, uint256 amount_) external;

    /**
     * The function to claim rewards from the pool.
     * @param builderPoolId_ The pool's id.
     * @param receiver_ The receiver's address.
     */
    function claim(bytes32 builderPoolId_, address receiver_) external;

    /**
     * The function to get the current user multiplier.
     * @param builderPoolId_ The pool's id.
     * @param user_ The user's address.
     */
    function getCurrentUserMultiplier(bytes32 builderPoolId_, address user_) external view returns (uint256);

    /**
     * The function to get the builder's reward.
     * @param builderPoolId_ The pool's id.
     * @return The user's reward amount.
     */
    function getCurrentBuilderReward(bytes32 builderPoolId_) external view returns (uint256);

    /**
     * The function to get the address of deposit token.
     * @return The address of deposit token.
     */
    function depositToken() external view returns (address);

    /**
     * The function to get the contract version.
     */
    function version() external pure returns (uint256);

    /**
     * The function to set the new migration owner.
     * @param value_ The new contract address
     */
    function setMigrationOwner(address value_) external;

    /**
     * The function to set BuilderSubnet contract address.
     * @param value_ Contract address
     */
    function setBuilderSubnets(address value_) external;

    /**
     * The function to set the new pause value.
     */
    function pause() external;

    /**
     * The function to set the new pause value for migration process.
     */
    function pauseForMigration() external;

    /**
     * The function to migrate user's stakes to the new contract.
     * @param builderPoolIds_ The pool's ids.
     * @param users_ The user's addresses.
     */
    function migrateUsersStake(bytes32[] calldata builderPoolIds_, address[] calldata users_) external;

    /**
     * The function to migrate caller stake to the new contract.
     * @param builderPoolId_ The pool's id.
     */
    function migrateUserStake(bytes32 builderPoolId_) external;
}
