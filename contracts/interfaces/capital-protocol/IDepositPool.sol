// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {IReferrer} from "./IReferrer.sol";

/**
 * @title IDepositPool
 * @notice Defines the basic interface for the DepositPool
 */
interface IDepositPool is IERC165, IReferrer {
    /**
     * @notice The structure that stores the reward pool rate data.
     * @param lastUpdate The timestamp when the pool was last updated.
     * @param rate The current reward rate. Variable used for internal calculations.
     * @param totalVirtualDeposited The total amount of tokens deposited in the pool with the users power factor.
     */
    struct RewardPoolData {
        uint128 lastUpdate;
        uint256 rate;
        uint256 totalVirtualDeposited;
    }

    /**
     * @notice The structure that stores the additional reward pool data.
     * @param withdrawLockPeriodAfterStake The period in seconds when the user can't withdraw his stake after the `stake()`.
     * @param claimLockPeriodAfterStake The period in seconds when the user can't claim tokens after the `stake()`.
     * @param claimLockPeriodAfterClaim The period in seconds when the user can't claim tokens after thr `claim()`.
     * @param minimalStake The minimal stake amount that user should have on the contract balance, after the stake or withdraw.
     * @param distributedRewards Distributed reward amount for all reward pool.
     */
    struct RewardPoolProtocolDetails {
        uint128 withdrawLockPeriodAfterStake;
        uint128 claimLockPeriodAfterStake;
        uint128 claimLockPeriodAfterClaim;
        uint256 minimalStake;
        uint256 distributedRewards;
    }

    /**
     * @notice The structure that stores the user data of the `DepositPool`.
     * @param lastStake The timestamp when the user last staked the `depositToken`.
     * @param deposited The amount of tokens deposited by user in the `DepositPool`.
     * @param rate The current reward rate. Used for internal calculations.
     * @param pendingRewards Number of rewards accrued to the user. Is not the final reward at a given time. Used for internal calculations.
     * @param claimLockStart The timestamp when the user locked his rewards.
     * @param claimLockEnd The timestamp when the user can claim his rewards.
     * @param virtualDeposited The amount of tokens deposited in the pool with user power factor.
     * @param lastClaim A timestamp of the last time the user call the `claim()`.
     * @param referrer The user referrer address.
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
     * @notice The event that is emitted when the `Distributor` contract address set.
     * @param distributor The `Distributor` contract address.
     */
    event DistributorSet(address distributor);

    /**
     * @notice The event that is emitted when the `Distributor` contract address set.
     * @param rewardPoolIndex The reward pool index.
     * @param withdrawLockPeriodAfterStake The period in seconds when the user can't withdraw his stake after the `stake()`.
     * @param claimLockPeriodAfterStake The period in seconds when the user can't claim tokens after the `stake()`.
     * @param claimLockPeriodAfterClaim The period in seconds when the user can't claim tokens after thr `claim()`.
     * @param minimalStake The minimal stake amount that user should have on the contract balance, after the stake or withdraw.
     */
    event RewardPoolsDataSet(
        uint256 rewardPoolIndex,
        uint128 withdrawLockPeriodAfterStake,
        uint128 claimLockPeriodAfterStake,
        uint128 claimLockPeriodAfterClaim,
        uint256 minimalStake
    );

    /**
     * @notice The event that is emitted when the `migrate()` function executed.
     * @param rewardPoolIndex The reward pool index for the public reward pool.
     */
    event Migrated(uint256 rewardPoolIndex);

    /**
     * @notice The event that is emitted when the pool referrers tiers are edited.
     * @param rewardPoolIndex The reward pool index.
     * @param tiers The referrers tiers.
     */
    event ReferrerTiersEdited(uint256 indexed rewardPoolIndex, ReferrerTier[] tiers);

    /**
     * @notice The event that is emitted when the user stakes tokens in the pool.
     * @param rewardPoolIndex The reward pool index.
     * @param user The user's address.
     * @param amount The amount of staked tokens.
     */
    event UserStaked(uint256 indexed rewardPoolIndex, address indexed user, uint256 amount);

    /**
     * @notice The event that is emitted when the user claims rewards from the pool.
     * @param rewardPoolIndex The reward pool index.
     * @param user The user's address.
     * @param receiver The receiver's address.
     * @param amount The amount of tokens.
     */
    event UserClaimed(uint256 indexed rewardPoolIndex, address indexed user, address receiver, uint256 amount);

    /**
     * @notice The event that is emitted when the referrer claims rewards.
     * @param rewardPoolIndex The reward pool index.
     * @param user The user's address.
     * @param receiver The reward receiver's address.
     * @param amount The amount of claimed rewards.
     */
    event ReferrerClaimed(uint256 indexed rewardPoolIndex, address indexed user, address receiver, uint256 amount);

    /**
     * @notice The event that is emitted when the user withdraws tokens from the pool.
     * @param rewardPoolIndex The reward pool index.
     * @param user The user's address.
     * @param amount The amount of tokens to withdraw.
     */
    event UserWithdrawn(uint256 indexed rewardPoolIndex, address indexed user, uint256 amount);

    /**
     * @notice The event that is emitted when the user locks his rewards.
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
     * @notice The event that is emitted when the address allowed to claim set.
     * @param holder Address who add allowance.
     * @param caller Claim caller.
     * @param isAllowed Allowed or not.
     */
    event AddressAllowedToClaimSet(address holder, address caller, bool isAllowed);

    /**
     * @notice The event that is emitted when the user is referred.
     * @param rewardPoolIndex The reward pool index.
     * @param user The user's address.
     * @param referrer The referrer's address.
     * @param amount The amount of tokens.
     */
    event UserReferred(uint256 indexed rewardPoolIndex, address indexed user, address indexed referrer, uint256 amount);

    /**
     * @notice The event that is emitted when the claim sender set.
     * @param rewardPoolIndex The reward pool index.
     * @param staker The staker's address.
     * @param sender The `_msgSender()` address.
     * @param isAllowed True - when `sender` can claim against `staker`.
     */
    event ClaimSenderSet(uint256 rewardPoolIndex, address staker, address sender, bool isAllowed);

    /**
     * @notice The event that is emitted when the claim receiver set.
     * @param rewardPoolIndex The reward pool index.
     * @param staker The staker's address.
     * @param receiver The L2 receiver address.
     */
    event ClaimReceiverSet(uint256 rewardPoolIndex, address staker, address receiver);

    /**
     * @notice The function to receive the possibility to upgrade the contract.
     * @return The `false` when contract can be upgraded.
     */
    function isNotUpgradeable() external view returns (bool);

    /**
     * @notice The function to receive the deposit token (stETH, wBTC...).
     * @return The deposit token.
     */
    function depositToken() external view returns (address);

    /**
     * @notice The function to receive the total deposited in public pool amount of deposit token.
     * @return The total deposited in public pool amount.
     */
    function totalDepositedInPublicPools() external view returns (uint256);

    /**
     * @notice The function to receive the migration end flag.
     * @return The `true`, when end.
     */
    function isMigrationOver() external view returns (bool);

    /**
     * @notice The function to receive the `Distributor` contract address.
     * @return The `Distributor` contract address.
     */
    function distributor() external view returns (address);

    /**
     * @notice The function to initialize the contract.

     * @param depositToken_ The address of the deposit token. Users stake this token.
     * @param distributor_ The `Distributor` contract address.
     */
    function DepositPool_init(address depositToken_, address distributor_) external;

    /**
     * @notice The function to set the the `Distributor` contract address.
     * @dev Only for the contract `owner()`.
     * @param value_ The `Distributor` contract address.
     */
    function setDistributor(address value_) external;

    /**
     * @notice The function to fill the `RewardPoolProtocolDetails` struct.
     * @dev Only for the contract `owner()`.
     * @param rewardPoolIndex_ The reward pool index.
     * @param withdrawLockPeriodAfterStake_ The period in seconds when the user can't withdraw his stake after the `stake()`.
     * @param claimLockPeriodAfterStake_ The period in seconds when the user can't claim tokens after the `stake()`.
     * @param claimLockPeriodAfterClaim_ The period in seconds when the user can't claim tokens after thr `claim()`.
     * @param minimalStake_ The minimal stake amount that user should have on the contract balance, after the stake or withdraw.
     */
    function setRewardPoolProtocolDetails(
        uint256 rewardPoolIndex_,
        uint128 withdrawLockPeriodAfterStake_,
        uint128 claimLockPeriodAfterStake_,
        uint128 claimLockPeriodAfterClaim_,
        uint256 minimalStake_
    ) external;

    /**
     * @notice The function to migrate contract data to the new version. From V6 to V7.
     * @dev Only for the contract `owner()`.
     * @param rewardPoolIndex_ The reward pool index for the public reward pool.
     */
    function migrate(uint256 rewardPoolIndex_) external;

    /**
     * @notice The function to update the referrer tiers.
     * @dev Only for the contract `owner()`.
     * @param rewardPoolIndex_ The reward pool index.
     * @param referrerTiers_ The referrers tiers.
     */
    function editReferrerTiers(uint256 rewardPoolIndex_, ReferrerTier[] calldata referrerTiers_) external;

    /**
     * @notice The function to manage users and their stake amount in the private pools.
     * @dev Only for the contract `owner()`.
     * @param rewardPoolIndex_ The private reward poll index.
     * @param users_ The array of users.
     * @param amounts_ The array of final staked amount.
     * @param claimLockEnds_ The array of claim lock ends.
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
     * @notice The function to set the addresses which can claim against initial staker.
     * @param rewardPoolIndex_ The reward poll index.
     * @param senders_  The addresses list
     * @param isAllowed_ Allowed or not
     */
    function setClaimSender(uint256 rewardPoolIndex_, address[] calldata senders_, bool[] calldata isAllowed_) external;

    /**
     * @notice The function to set the addresses to receive rewards when call is from any `_msgSender()`.
     * @param rewardPoolIndex_ The reward poll index.
     * @param receiver_  The receiver address
     */
    function setClaimReceiver(uint256 rewardPoolIndex_, address receiver_) external;

    /**
     * @notice The function to stake the `depositToken` tokens in the public pool.
     * @param rewardPoolIndex_ The public reward poll index.
     * @param amount_ The amount of tokens to stake.
     * @param claimLockEnd_ The timestamp when the user can claim his rewards. The default value is zero.
     * @param referrer_ The referrer address. The default value is zero address.
     */
    function stake(uint256 rewardPoolIndex_, uint256 amount_, uint128 claimLockEnd_, address referrer_) external;

    /**
     * @notice The function to withdraw tokens from the public pool.
     * @param rewardPoolIndex_ The public reward poll index.
     * @param amount_ The amount of tokens to withdraw.
     */
    function withdraw(uint256 rewardPoolIndex_, uint256 amount_) external;

    /**
     * @notice The function to claim rewards from the pool.
     * @param rewardPoolIndex_ The reward poll index.
     * @param receiver_ The rewards receiver's address.
     */
    function claim(uint256 rewardPoolIndex_, address receiver_) external payable;

    /**
     * @notice The function to claim rewards from the pool for the specified staker.
     * @dev The caller should be whitelisted with `setAddressesAllowedToClaim()`.
     * @param poolId_ The pool's id.
     * @param user_ Specified address.
     * @param receiver_ The rewards receiver's address.
     */
    function claimFor(uint256 poolId_, address user_, address receiver_) external payable;

    /**
     * @notice The function to claim referrer rewards from the pool.
     * @param poolId_ The pool's id.
     * @param receiver_ The rewards receiver's address.
     */
    function claimReferrerTier(uint256 poolId_, address receiver_) external payable;

    /**
     * @notice The function to claim referrer rewards from the pool for the specified referrer.
     * @dev The caller should be whitelisted with `setAddressesAllowedToClaim()`.
     * @param poolId_ The pool's id.
     * @param referrer_ Specified referrer.
     * @param receiver_ The rewards receiver's address.
     */
    function claimReferrerTierFor(uint256 poolId_, address referrer_, address receiver_) external payable;

    /**
     * @notice The function to lock rewards and receive power factors.
     * @param rewardPoolIndex_ The reward poll index.
     * @param claimLockEnd_ The timestamp when the user can claim his rewards.
     */
    function lockClaim(uint256 rewardPoolIndex_, uint128 claimLockEnd_) external;

    /**
     * @notice The function to get the latest user's reward for the specified pool.
     * @param rewardPoolIndex_ The reward poll index.
     * @param user_ The user's address.
     * @return The amount of latest user's rewards.
     */
    function getLatestUserReward(uint256 rewardPoolIndex_, address user_) external view returns (uint256);

    /**
     * @notice The function to get the latest referrer's reward for the specified pool.
     * @param rewardPoolIndex_ The reward poll index.
     * @param user_ The user's address.
     * @return The amount of latest referrer's rewards.
     */
    function getLatestReferrerReward(uint256 rewardPoolIndex_, address user_) external view returns (uint256);

    /**
     * @notice The function to get the current user power factor.
     * @param rewardPoolIndex_ The reward poll index.
     * @param user_ The user's address.
     * @return The current user multiplier.
     */
    function getCurrentUserMultiplier(uint256 rewardPoolIndex_, address user_) external view returns (uint256);

    /**
     * @notice The function to get the current referrer's power factor
     * @param rewardPoolIndex_ The reward poll index.
     * @param referrer_ The referrer's address.
     * @return The current referrer multiplier.
     */
    function getReferrerMultiplier(uint256 rewardPoolIndex_, address referrer_) external view returns (uint256);

    /**
     * @notice The function to remove the contract upgradeability.
     * @dev Only for the contract `owner()`.
     */
    function removeUpgradeability() external;

    /**
     * @notice The function to get the contract version.
     * @return The current contract version
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
