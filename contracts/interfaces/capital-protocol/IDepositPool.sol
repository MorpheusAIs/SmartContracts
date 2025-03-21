// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

import {IReferrer} from "./IReferrer.sol";

interface IDepositPool is IERC165, IReferrer {
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
     * @param lastClaim The user last claim timestamp.
     * @param referrer The referrer address.
     */
    struct UserData {
        uint128 lastStake;
        uint256 deposited;
        uint256 rate;
        uint256 pendingRewards;
        // `DistributionV2` storage updates
        uint128 claimLockStart;
        uint128 claimLockEnd;
        uint256 virtualDeposited;
        // `DistributionV4` storage updates
        uint128 lastClaim;
        // `DistributionV5` storage updates
        address referrer;
    }

    /**
     * The structure that stores the additional reward pool data.
     * @param withdrawLockPeriodAfterStake The period in seconds when the user can't withdraw his stake after staking.
     * @param claimLockPeriodAfterStake The period in seconds when the user can't claim tokens after the stake.
     * @param claimLockPeriodAfterClaim The period in seconds when the user can't claim tokens after thr claim.
     * @param minimalStake The minimal stake amount.
     * @param distributedRewards Distributed reward amount.
     */
    struct RewardPoolProtocolDetails {
        uint128 withdrawLockPeriodAfterStake;
        uint128 claimLockPeriodAfterStake;
        uint128 claimLockPeriodAfterClaim;
        uint256 minimalStake;
        uint256 distributedRewards;
    }

    /**
     * The event that is emitted when the `Distributor` contract address set.
     * @param distributor The `Distributor` contract address.
     */
    event DistributorSet(address distributor);

    /**
     * The event that is emitted when the `Distributor` contract address set.
     * @param rewardPoolIndex The reward pool index.
     * @param withdrawLockPeriodAfterStake The period in seconds when the user can't withdraw his stake after staking.
     * @param claimLockPeriodAfterStake The period in seconds when the user can't claim tokens after the stake.
     * @param claimLockPeriodAfterClaim The period in seconds when the user can't claim tokens after thr claim.
     * @param minimalStake The minimal stake amount.
     */
    event RewardPoolsDataSet(
        uint256 rewardPoolIndex,
        uint128 withdrawLockPeriodAfterStake,
        uint128 claimLockPeriodAfterStake,
        uint128 claimLockPeriodAfterClaim,
        uint256 minimalStake
    );

    event Migrated(uint256 rewardPoolIndex);

    /**
     * The event that is emitted when the pool referrers tiers are edited.
     * @param rewardPoolIndex The reward pool index.
     * @param tiers The reward pool referrers tiers.
     */
    event ReferrerTiersEdited(uint256 indexed rewardPoolIndex, ReferrerTier[] tiers);

    /**
     * The event that is emitted when the user stakes tokens in the pool.
     * @param rewardPoolIndex The reward pool index.
     * @param user The user's address.
     * @param amount The amount of tokens.
     */
    event UserStaked(uint256 indexed rewardPoolIndex, address indexed user, uint256 amount);

    /**
     * The event that is emitted when the user claims rewards from the pool.
     * @param rewardPoolIndex The reward pool index.
     * @param user The user's address.
     * @param receiver The receiver's address.
     * @param amount The amount of tokens.
     */
    event UserClaimed(uint256 indexed rewardPoolIndex, address indexed user, address receiver, uint256 amount);

    /**
     * The event that is emitted when the referrer claims rewards.
     * @param rewardPoolIndex The reward pool index.
     * @param user The user's address.
     * @param receiver The receiver's address.
     * @param amount The amount of tokens.
     */
    event ReferrerClaimed(uint256 indexed rewardPoolIndex, address indexed user, address receiver, uint256 amount);

    /**
     * The event that is emitted when the user withdraws tokens from the pool.
     * @param rewardPoolIndex The reward pool index.
     * @param user The user's address.
     * @param amount The amount of tokens.
     */
    event UserWithdrawn(uint256 indexed rewardPoolIndex, address indexed user, uint256 amount);

    /**
     * The event that is emitted when the user locks his rewards.
     * @param rewardPoolIndex The reward pool index.
     * @param user The user's address.
     * @param claimLockStart The timestamp when the user locked his rewards.
     * @param claimLockEnd The timestamp when the user can claim his rewards.
     */
    event UserClaimLocked(
        uint256 indexed rewardPoolIndex,
        address indexed user,
        uint128 claimLockStart,
        uint128 claimLockEnd
    );

    /**
     * The event that is emitted when the user is referred.
     * @param rewardPoolIndex The reward pool index.
     * @param user The user's address.
     * @param referrer The referrer's address.
     * @param amount The amount of tokens.
     */
    event UserReferred(uint256 indexed rewardPoolIndex, address indexed user, address indexed referrer, uint256 amount);

    /**
     * The function to initialize the contract.
     * @param depositToken_ The address of the deposit token.
     * @param distributor_ The `Distributor` contract address.
     */
    function DepositPool_init(address depositToken_, address distributor_) external;

    /**
     * The function to set the the `Distributor` contract address.
     * @param value_ The `Distributor` contract address.
     */
    function setDistributor(address value_) external;

    /**
     * The function to fill the `RewardPoolProtocolDetails` struct
     * @param rewardPoolIndex_ The reward pool index.
     * @param withdrawLockPeriodAfterStake_ The period in seconds when the user can't withdraw his stake after staking.
     * @param claimLockPeriodAfterStake_ The period in seconds when the user can't claim tokens after the stake.
     * @param claimLockPeriodAfterClaim_ The period in seconds when the user can't claim tokens after thr claim.
     * @param minimalStake_ The minimal stake amount.
     */
    function setRewardPoolProtocolDetails(
        uint256 rewardPoolIndex_,
        uint128 withdrawLockPeriodAfterStake_,
        uint128 claimLockPeriodAfterStake_,
        uint128 claimLockPeriodAfterClaim_,
        uint256 minimalStake_
    ) external;

    /**
     * The function to migrate contract data to the new version
     * @param rewardPoolIndex_ The reward pool index.
     */
    function migrate(uint256 rewardPoolIndex_) external;

    /**
     * The function to manage users and their rate in the private pool.
     * @param rewardPoolIndex_ The reward poll index.
     * @param users_ The array of users.
     * @param amounts_ The array of amounts.
     * @param claimLockEnds_ The array of lock ends.
     * @param referrers_ The array of referrers.
     */
    function manageUsersInPrivateRewardPool(
        uint256 rewardPoolIndex_,
        address[] calldata users_,
        uint256[] calldata amounts_,
        uint128[] calldata claimLockEnds_,
        address[] calldata referrers_
    ) external;

    /**
     * The function to stake tokens in the public pool.
     * @param rewardPoolIndex_ The reward poll index.
     * @param amount_ The amount of tokens to stake.
     * @param claimLockEnd_ The timestamp when the user can claim his rewards.
     * @param referrer_ The referrer address.
     */
    function stake(uint256 rewardPoolIndex_, uint256 amount_, uint128 claimLockEnd_, address referrer_) external;

    /**
     * The function to claim rewards from the pool.
     * @param rewardPoolIndex_ The reward poll index.
     * @param receiver_ The receiver's address.
     */
    function claim(uint256 rewardPoolIndex_, address receiver_) external payable;

    /**
     * The function to withdraw tokens from the pool.
     * @param rewardPoolIndex_ The reward poll index.
     * @param amount_ The amount of tokens to withdraw.
     */
    function withdraw(uint256 rewardPoolIndex_, uint256 amount_) external;

    /**
     * The function to lock rewards.
     * @param rewardPoolIndex_ The reward poll index.
     * @param claimLockEnd_ The timestamp when the user can claim his rewards.
     */
    function lockClaim(uint256 rewardPoolIndex_, uint128 claimLockEnd_) external;

    /**
     * The function to get the user's reward for the specified pool.
     * @param rewardPoolIndex_ The reward poll index.
     * @param user_ The user's address.
     */
    function getLatestUserReward(uint256 rewardPoolIndex_, address user_) external view returns (uint256);

    /**
     * The function to get the referrer's reward for the specified pool.
     * @param rewardPoolIndex_ The reward poll index.
     * @param user_ The user's address.
     */
    function getLatestReferrerReward(uint256 rewardPoolIndex_, address user_) external view returns (uint256);

    /**
     * The function to get the claim lock period multiplier.
     * @param rewardPoolIndex_ The reward poll index.
     * @param claimLockStart_ Claim lock start timestamp.
     * @param claimLockEnd_ Claim lock end timestamp.
     */
    function getClaimLockPeriodMultiplier(
        uint256 rewardPoolIndex_,
        uint128 claimLockStart_,
        uint128 claimLockEnd_
    ) external view returns (uint256);

    /**
     * The function to get the current user multiplier.
     * @param rewardPoolIndex_ The reward poll index.
     * @param user_ The user's address.
     */
    function getCurrentUserMultiplier(uint256 rewardPoolIndex_, address user_) external view returns (uint256);

    /**
     * The function to get the referrer's multiplier
     * @param rewardPoolIndex_ The reward poll index.
     * @param referrer_ The referrer's address.
     */
    function getReferrerMultiplier(uint256 rewardPoolIndex_, address referrer_) external view returns (uint256);

    /**
     * The function to remove the upgradeability.
     */
    function removeUpgradeability() external;

    /**
     * The function to get the contract version.
     */
    function version() external pure returns (uint256);

    /** @dev Deprecated in the v6 update. */
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

    /** @dev Deprecated in the v6 update. */
    struct RewardPoolLimits {
        uint128 claimLockPeriodAfterStake;
        uint128 claimLockPeriodAfterClaim;
    }
}
