// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

/**
 * @title IBuilderSubnets
 * @notice Defines the basic interface for the `BuilderSubnets` contract
 */
interface IBuilderSubnets is IERC165 {
    /**
     * @notice The structure that stores the Subnet main info.
     * @param name The Subnet name.
     * @param owner This address will be able to edit information about the Subnet.
     * @param minStake The minimal stake amount.
     * @param fee The Subnet will charge a fee from the Stakers on `claim`. Where 1% = 10^25
     * @param feeTreasury The `fee` will transfer to this address.
     * @param startsAt At this point, the stake will open, timestamp.
     * @param withdrawLockPeriodAfterStake After the each steak, the user will not be able to withdraw his deposit this period of time.
     */
    struct Subnet {
        string name;
        address owner;
        uint256 minStake;
        uint256 fee;
        address feeTreasury;
        uint128 startsAt;
        uint128 withdrawLockPeriodAfterStake;
    }

    /**
     * @notice The structure that stores the Subnet metadata.
     * @param slug The slug string.
     * @param description The description string.
     * @param website The website string.
     * @param image The image string.
     */
    struct SubnetMetadata {
        string slug;
        string description;
        string website;
        string image;
    }

    /**
     * @notice The structure that stores the Subnet data.
     * @param staked The total staked amount into the Subnet.
     */
    struct SubnetData {
        uint256 staked;
    }

    /**
     * @notice The structure that stores the all Subnets data.
     * @param staked The total staked amount into the all Subnets.
     * @param rate Coefficient for calculating rewards. Variable used for internal calculations.
     * @param undistributedRewards Amount of rewards that were not distributed due to the absence of stakers.
     * @param lastCalculatedTimestamp The last timestamp when the rewards were distributed. Variable used for internal calculations.
     */
    struct AllSubnetsData {
        uint256 staked;
        uint256 rate;
        uint256 undistributedRewards;
        uint128 lastCalculatedTimestamp;
    }

    /**
     * @notice The structure that stores the Staker data.
     * @param staked The staked amount.
     * @param pendingRewards Rewards that have been accrued to the user but have not yet been claimed. Current rewards may be higher than the pending rewards.
     * @param rate Coefficient for calculating rewards. Variable used for internal calculations.
     * @param lastStake The last timestamp when the user staked.
     */
    struct Staker {
        uint256 staked;
        uint256 pendingRewards;
        uint256 rate;
        uint128 lastStake;
    }

    /**
     * @notice The structure that stores the reward pool data (the pool from the mainnet).
     * @param payoutStart The timestamp, when calculation start.
     * @param interval The decrease interval, seconds. Internal usage.
     * @param initialAmount The initial token rewards amount. Internal usage.
     * @param decreaseAmount The amount of tokens. Each `decreaseInterval`, `initialReward` decrease by this amount. Internal usage.
     */
    struct BuildersRewardPoolData {
        uint256 initialAmount;
        uint256 decreaseAmount;
        uint128 payoutStart;
        uint128 interval;
    }

    /**
     * @notice The event that is emitted when the Subnet owner changed.
     * @param subnetId The Subnet ID.
     * @param oldValue The old Subnet owner.
     * @param newValue The new Subnet owner.
     */
    event SubnetOwnerSet(bytes32 subnetId, address oldValue, address newValue);

    /**
     * @notice The event that is emitted when the Subnet min stake changed.
     * @param subnetId The Subnet ID.
     * @param oldValue The old Subnet min stake.
     * @param newValue The new Subnet min stake.
     */
    event SubnetMinStakeSet(bytes32 subnetId, uint256 oldValue, uint256 newValue);

    /**
     * @notice The event that is emitted when the Subnet fee changed.
     * @param subnetId The Subnet ID.
     * @param oldValue The old Subnet fee.
     * @param newValue The new Subnet fee.
     */
    event SubnetFeeSet(bytes32 subnetId, uint256 oldValue, uint256 newValue);

    /**
     * @notice The event that is emitted when the Subnet fee treasury changed.
     * @param subnetId The Subnet ID.
     * @param oldValue The old Subnet fee treasury.
     * @param newValue The new Subnet fee treasury.
     */
    event SubnetFeeTreasurySet(bytes32 subnetId, address oldValue, address newValue);

    /**
     * @notice The event that is emitted when the FeeConfig contract address is set.
     * @param feeConfig The address of the new FeeConfig contract.
     */
    event FeeConfigSet(address feeConfig);

    /**
     * @notice The event that is emitted when the treasury address is set.
     * @param treasury The address of the treasury.
     */
    event TreasurySet(address treasury);

    /**
     * @notice The event that is emitted when the builders pool data is set.
     * @param buildersRewardPoolData The new value.
     */
    event BuildersRewardPoolDataSet(BuildersRewardPoolData buildersRewardPoolData);

    /**
     * @notice The event that is emitted when the reward calculation starts at timestamp is set.
     * @param rewardCalculationStartsAt The new value.
     */
    event RewardCalculationStartsAtSet(uint128 rewardCalculationStartsAt);

    /**
     * @notice The event that is emitted when the max staked share from builders pool is set.
     * @param maxStakedShareForBuildersPool The new value.
     */
    event MaxStakedShareForBuildersPoolSet(uint256 maxStakedShareForBuildersPool);

    /**
     * @notice The event that is emitted when the minimal withdraw lock period after stake is set.
     * @param minWithdrawLockPeriodAfterStake The minimal withdraw lock period.
     */
    event MinimalWithdrawLockPeriodSet(uint256 minWithdrawLockPeriodAfterStake);

    /**
     * @notice The event that is emitted when the Subnet creation fee and treasury changed
     * @param amount The token amount
     * @param treasury The treasury address
     */
    event SubnetCreationFeeSet(uint256 amount, address treasury);

    /**
     * @notice The event that is emitted when the `isMigrationOver` is set.
     * @param isMigrationOver The new value.
     */
    event IsMigrationOverSet(bool isMigrationOver);

    /**
     * @notice The event that is emitted when the `collectPendingRewards` call.
     * @param to The timestamp.
     */
    event RewardsCollected(uint128 to);

    /**
     * @notice The event that is emitted when the Subnet created or edited.
     * @param subnetId The Subnet ID.
     * @param subnet The Subnet data.
     */
    event SubnetEdited(bytes32 indexed subnetId, Subnet subnet);

    /**
     * @notice The event that is emitted when the Subnet created or edited.
     * @param subnetId The Subnet ID.
     * @param subnetMetadata The Subnet metadata.
     */
    event SubnetMetadataEdited(bytes32 indexed subnetId, SubnetMetadata subnetMetadata);

    /**
     * @notice The event that is emitted when the Staker staked.
     * @param subnetId The Subnet ID.
     * @param stakerAddress The Staker address.
     * @param staker The Staker struct.
     */
    event Staked(bytes32 indexed subnetId, address stakerAddress, Staker staker);

    /**
     * @notice The event that is emitted when the Staker withdrawn.
     * @param subnetId The Subnet ID.
     * @param stakerAddress The Staker address.
     * @param staker The Staker struct.
     * @param amount The withdrawn amount.
     */
    event Withdrawn(bytes32 indexed subnetId, address stakerAddress, Staker staker, uint256 amount);

    /**
     * @notice The event that is emitted when the Staker claimed.
     * @param subnetId The Subnet ID.
     * @param stakerAddress The Staker address.
     * @param fee The fee amount.
     * @param treasury The fee treasury address.
     */
    event FeePaid(bytes32 indexed subnetId, address stakerAddress, uint256 fee, address treasury);

    /**
     * @notice The event that is emitted when the Staker claimed.
     * @param subnetId The Subnet ID.
     * @param stakerAddress The Staker address.
     * @param staker The Staker struct.
     * @param amount The claimed amount.
     */
    event Claimed(bytes32 indexed subnetId, address stakerAddress, Staker staker, uint256 amount);

    /**
     * @notice The function to initialize the contract.
     * @dev Used only once.
     * @param token_ See the `token` description.
     * @param feeConfig_ See the `feeConfig` description.
     * @param treasury_ See the `treasury` description.
     * @param minWithdrawLockPeriodAfterStake_ See the `minWithdrawLockPeriodAfterStake` description.
     * @param buildersV3_ See the `buildersV3` description.
     */
    function BuilderSubnets_init(
        address token_,
        address feeConfig_,
        address treasury_,
        uint256 minWithdrawLockPeriodAfterStake_,
        address buildersV3_
    ) external;

    /**
     * @notice The function to set the `FeeConfig` contract address.
     * @dev Only for the contract `owner()`.
     * @param feeConfig_ The address of the new `FeeConfig`.
     */
    function setFeeConfig(address feeConfig_) external;

    /**
     * @notice The function to set the treasury address.
     * @dev Rewards are taken from this address. Only for the contract `owner()`.
     * @param treasury_ The new value.
     */
    function setTreasury(address treasury_) external;

    /**
     * @notice The function to set the `buildersRewardPoolData` variable. Can be taken from the mainnet
     * contract on the Ethereum network.
     * @dev Only for the contract `owner()`.
     * @param buildersRewardPoolData_ The new value.
     */
    function setBuildersRewardPoolData(BuildersRewardPoolData calldata buildersRewardPoolData_) external;

    /**
     * @notice The function to set `rewardCalculationStartsAt` variable
     * @dev This variable is required for calculations, it sets the time at which
     * the calculation of rewards will start. That is, before this time the rewards
     * will not be calculated. Only for the contract `owner()`.
     * @param rewardCalculationStartsAt_ The new value.
     */
    function setRewardCalculationStartsAt(uint128 rewardCalculationStartsAt_) external;

    /**
     * @notice The function to set `minWithdrawLockPeriodAfterStake` variable
     * @dev Staker tokens locked for this period (at least) after the stake. Only for the contract `owner()`.
     * @param minWithdrawLockPeriodAfterStake_ The new value.
     */
    function setMinWithdrawLockPeriodAfterStake(uint256 minWithdrawLockPeriodAfterStake_) external;

    /**
     * @notice The function to disable `isAllowStakesFromOtherAccounts` variable
     * @dev This parameter is needed to migrate tokens from V3. Only for the contract `owner()`.
     * @param value_ New value
     */
    function setIsMigrationOver(bool value_) external;

    /**
     * @notice The function to create a Subnet.
     * @param subnet_ The Subnet data.
     * @param metadata_ The Subnet metadata.
     */
    function createSubnet(Subnet calldata subnet_, SubnetMetadata calldata metadata_) external;

    /**
     * @notice The function to edit the Subnet metadata.
     * @dev Only for the Subnet owner.
     * @param subnetId_ The Subnet ID.
     * @param metadata_ The Subnet metadata.
     */
    function editSubnetMetadata(bytes32 subnetId_, SubnetMetadata calldata metadata_) external;

    /**
     * @notice The function to change the Subnet ownership.
     * @dev Only for the Subnet owner.
     * @param subnetId_ The Subnet ID.
     * @param newValue_ The new Subnet ownership.
     */
    function setSubnetOwnership(bytes32 subnetId_, address newValue_) external;

    /**
     * @notice The function to change the Subnet `minStake`.
     * @dev Only for the Subnet owner.
     * @param subnetId_ The Subnet ID.
     * @param newValue_ The new minimal stake value.
     */
    function setSubnetMinStake(bytes32 subnetId_, uint256 newValue_) external;

    /**
     * @notice The function to change the Subnet `fee`. The value cannot be increased.
     * @dev Only for the Subnet owner.
     * @param subnetId_ The Subnet ID.
     * @param newValue_ The new fee value.
     */
    function setSubnetFee(bytes32 subnetId_, uint256 newValue_) external;

    /**
     * @notice The function to change the Subnet `feeTreasury`.
     * @dev Only for the Subnet owner.
     * @param subnetId_ The Subnet ID.
     * @param newValue_ The new fee treasury value.
     */
    function setSubnetFeeTreasury(bytes32 subnetId_, address newValue_) external;

    /**
     * @notice The function to get the Subnet ID.
     * @param name_ The Subnet name.
     */
    function getSubnetId(string memory name_) external pure returns (bytes32);

    /**
     * @notice The function to stake tokens to the Subnet.
     * @param subnetId_ The Subnet ID.
     * @param stakerAddress_ The Staker address.
     * @param amount_ The staked amount, wei.
     */
    function stake(bytes32 subnetId_, address stakerAddress_, uint256 amount_) external;

    /**
     * @notice The function to withdraw tokens from the Subnet.
     * @param subnetId_ The Subnet ID.
     * @param amount_ The withdrawn amount, wei.
     */
    function withdraw(bytes32 subnetId_, uint256 amount_) external;

    /**
     * @notice The function to claim rewards.
     * @param subnetId_ The Subnet ID.
     * @param stakerAddress_ The staker address.
     */
    function claim(bytes32 subnetId_, address stakerAddress_) external;

    /**
     * @notice The function to receive the latest Staker rewards amount.
     * @param subnetId_ The Subnet ID.
     * @param stakerAddress_ The staker address.
     * @return The rewards amount.
     */
    function getStakerRewards(bytes32 subnetId_, address stakerAddress_) external view returns (uint256);

    /**
     * @notice The function to calculate rewards from the Builder pool.
     * @param from_ The timestamp.
     * @param to_ The timestamp.
     */
    function getBuildersPoolEmission(uint128 from_, uint128 to_) external view returns (uint256);

    /**
     * @notice The function to get the contract version.
     * @return The current contract version
     */
    function version() external pure returns (uint256);
}
