// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

import {IReferrer} from "./IReferrer.sol";

interface IDepositPool is IERC165, IReferrer {
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
     * The structure that stores the limits pool's data.
     * @param claimLockPeriodAfterStake The period in seconds when the user can't claim tokens after staking.
     * @param claimLockPeriodAfterClaim The period in seconds when the user can't claim tokens after claiming.
     */
    struct PoolLimits {
        uint128 claimLockPeriodAfterStake;
        uint128 claimLockPeriodAfterClaim;
    }

    /**
     * The structure that stores the pool's rate data.
     * @param lastUpdate The timestamp when the pool was updated.
     * @param rate The current reward rate.
     * @param totalVirtualDeposited The total amount of tokens deposited in the pool with multiplier.
     */
    struct RewardPoolData {
        uint128 lastUpdate;
        uint256 rate;
        uint256 totalVirtualDeposited;
    }

    /**
     * The structure that stores the user's rate data of the pool.
     * @param lastStake The timestamp when the user last staked tokens.
     * @param deposited The amount of tokens deposited in the pool.
     * @param rate The current reward rate.
     * @param pendingRewards The amount of pending rewards.
     * @param claimLockStart The timestamp when the user locked his rewards.
     * @param claimLockEnd The timestamp when the user can claim his rewards.
     * @param virtualDeposited The amount of tokens deposited in the pool with user multiplier.
     */
    struct UserData {
        uint128 lastStake;
        uint256 deposited;
        uint256 rate;
        uint256 pendingRewards;
        // Storage changes for the DistributionV2
        uint128 claimLockStart;
        uint128 claimLockEnd;
        uint256 virtualDeposited;
        // Storage changes for the DistributionV4
        uint128 lastClaim;
        // Storage changes for the DistributionV5
        address referrer;
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
     * The event that is emitted when the pool limits are edited.
     * @param poolId The pool's id.
     * @param poolLimit The pool's limit data.
     */
    event PoolLimitsEdited(uint256 indexed poolId, PoolLimits poolLimit);

    /**
     * The event that is emitted when the pool referrers tiers are edited.
     * @param poolId The pool's id.
     * @param tiers The pool's referrers tiers.
     */
    event ReferrerTiersEdited(uint256 indexed poolId, ReferrerTier[] tiers);

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
     * The event that is emitted when the referrer claims rewards.
     * @param poolId The pool's id.
     * @param user The user's address.
     * @param receiver The receiver's address.
     * @param amount The amount of tokens.
     */
    event ReferrerClaimed(uint256 indexed poolId, address indexed user, address receiver, uint256 amount);

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
     * The event that is emitted when the user locks his rewards.
     * @param poolId The pool's id.
     * @param user The user's address.
     * @param claimLockStart The timestamp when the user locked his rewards.
     * @param claimLockEnd The timestamp when the user can claim his rewards.
     */
    event UserClaimLocked(uint256 indexed poolId, address indexed user, uint128 claimLockStart, uint128 claimLockEnd);

    /**
     * The event that is emitted when the user is referred.
     * @param poolId The pool's id.
     * @param user The user's address.
     * @param referrer The referrer's address.
     * @param amount The amount of tokens.
     */
    event UserReferred(uint256 indexed poolId, address indexed user, address indexed referrer, uint256 amount);

    function depositToken() external view returns (address);
}
