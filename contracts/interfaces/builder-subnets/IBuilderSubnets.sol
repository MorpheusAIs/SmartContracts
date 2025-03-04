// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

/**
 * This is the interface for BuilderSubnets contract.
 */
interface IBuilderSubnets is IERC165 {
    struct Subnet {
        string name;
        address owner;
        uint256 minStake;
        uint256 fee;
        address feeTreasury;
        uint128 startsAt;
        uint128 withdrawLockPeriodAfterStake;
        uint128 maxClaimLockEnd;
    }

    struct SubnetMetadata {
        string slug;
        string description;
        string website;
        string image;
    }

    struct SubnetData {
        uint256 staked;
        uint256 virtualStaked;
    }

    struct AllSubnetsData {
        uint256 staked;
        uint256 virtualStaked;
        uint256 rate;
        uint128 lastCalculatedTimestamp;
    }

    struct Staker {
        uint256 staked;
        uint256 virtualStaked;
        uint256 pendingRewards;
        uint256 rate;
        uint128 lastStake;
        uint128 claimLockEnd;
    }

    struct BuildersRewardPoolData {
        uint256 initialAmount;
        uint256 decreaseAmount;
        uint128 payoutStart;
        uint128 interval;
    }

    /**
     * The event that is emitted when the Subnet owner changed.
     * @param subnetId The Subnet ID.
     * @param oldValue The old Subnet owner.
     * @param newValue The new Subnet owner.
     */
    event SubnetOwnerSet(bytes32 subnetId, address oldValue, address newValue);

    /**
     * The event that is emitted when the Subnet min stake changed.
     * @param subnetId The Subnet ID.
     * @param oldValue The old Subnet min stake.
     * @param newValue The new Subnet min stake.
     */
    event SubnetMinStakeSet(bytes32 subnetId, uint256 oldValue, uint256 newValue);

    /**
     * The event that is emitted when the Subnet fee treasury changed.
     * @param subnetId The Subnet ID.
     * @param oldValue The old Subnet fee treasury.
     * @param newValue The new Subnet fee treasury.
     */
    event SubnetFeeTreasurySet(bytes32 subnetId, address oldValue, address newValue);

    /**
     * The event that is emitted when the Subnet max claim lock end changed.
     * @param subnetId The Subnet ID.
     * @param oldValue The old Subnet max claim lock end value.
     * @param newValue The new Subnet max claim lock end value.
     */
    event SubnetMaxClaimLockEndSet(bytes32 subnetId, uint128 oldValue, uint128 newValue);

    /**
     * The event that is emitted when the FeeConfig contract address is set.
     * @param feeConfig The address of the new FeeConfig contract.
     */
    event FeeConfigSet(address feeConfig);

    /**
     * The event that is emitted when the treasury address is set.
     * @param treasury The address of the treasury.
     */
    event TreasurySet(address treasury);

    /**
     * The event that is emitted when the builders pool data is set.
     * @param buildersRewardPoolData The new value.
     */
    event BuildersRewardPoolDataSet(BuildersRewardPoolData buildersRewardPoolData);

    /**
     * The event that is emitted when the reward calculation starts at timestamp is set.
     * @param rewardCalculationStartsAt The new value.
     */
    event RewardCalculationStartsAtSet(uint128 rewardCalculationStartsAt);

    /**
     * The event that is emitted when the max staked share from builders pool is set.
     * @param maxStakedShareForBuildersPool The new value.
     */
    event MaxStakedShareForBuildersPoolSet(uint256 maxStakedShareForBuildersPool);

    /**
     * The event that is emitted when the minimal withdraw lock period after stake is set.
     * @param minWithdrawLockPeriodAfterStake The minimal withdraw lock period.
     */
    event MinimalWithdrawLockPeriodSet(uint256 minWithdrawLockPeriodAfterStake);

    /**
     * The event that is emitted when the Subnet creation fee and treasury changed
     * @param amount The token amount
     * @param treasury The treasury address
     */
    event SubnetCreationFeeSet(uint256 amount, address treasury);
    /**
     * The event that is emitted when the `isMigrationOver` is set.
     * @param isMigrationOver The new value.
     */
    event IsMigrationOverSet(bool isMigrationOver);

    /**
     * The event that is emitted when the Subnet created or edited.
     * @param subnetId The Subnet ID.
     * @param subnet The Subnet data.
     */
    event SubnetEdited(bytes32 indexed subnetId, Subnet subnet);

    /**
     * The event that is emitted when the Subnet created or edited.
     * @param subnetId The Subnet ID.
     * @param subnetMetadata The Subnet metadata.
     */
    event SubnetMetadataEdited(bytes32 indexed subnetId, SubnetMetadata subnetMetadata);

    /**
     * The event that is emitted when the Staker staked.
     * @param subnetId The Subnet ID.
     * @param stakerAddress The Staker address.
     * @param staker The Staker struct.
     */
    event Staked(bytes32 indexed subnetId, address stakerAddress, Staker staker);

    /**
     * The event that is emitted when the Staker withdrawn.
     * @param subnetId The Subnet ID.
     * @param stakerAddress The Staker address.
     * @param staker The Staker struct.
     * @param amount The withdrawn amount.
     */
    event Withdrawn(bytes32 indexed subnetId, address stakerAddress, Staker staker, uint256 amount);

    /**
     * The event that is emitted when the Staker claimed.
     * @param subnetId The Subnet ID.
     * @param stakerAddress The Staker address.
     * @param fee The fee amount.
     * @param treasury The fee treasury address.
     */
    event FeePaid(bytes32 indexed subnetId, address stakerAddress, uint256 fee, address treasury);

    /**
     * The event that is emitted when the Staker claimed.
     * @param subnetId The Subnet ID.
     * @param stakerAddress The Staker address.
     * @param staker The Staker struct.
     * @param amount The claimed amount.
     */
    event Claimed(bytes32 indexed subnetId, address stakerAddress, Staker staker, uint256 amount);

    /**
     * The function to set the FeeConfig contract address.
     * @param feeConfig_ The address of the new FeeConfig.
     */
    function setFeeConfig(address feeConfig_) external;

    /**
     * The function to set the treasury address.
     * @dev Rewards are taken from this address
     * @param treasury_ The new value.
     */
    function setTreasury(address treasury_) external;

    /**
     * The function to set the `buildersRewardPoolData` variable. Can be taken from the Distribution
     * contract on the Ethereum network.
     * @param buildersRewardPoolData_ The new value.
     */
    function setBuildersRewardPoolData(BuildersRewardPoolData calldata buildersRewardPoolData_) external;

    /**
     * The function to set `rewardCalculationStartsAt` variable
     * @dev This variable is required for calculations, it sets the time at which
     * the calculation of rewards will start. That is, before this time the rewards
     * will not be calculated.
     * @param rewardCalculationStartsAt_ The new value.
     */
    function setRewardCalculationStartsAt(uint128 rewardCalculationStartsAt_) external;

    /**
     * The function to set `setMaxStakedShareForBuildersPool` variable
     * @dev This variable is required for maxStakedShareForBuildersPool_, sets the percent for the
     * current smart contract to the total reward pool. Since the current contract
     * can be deployed on multiple networks and the reward pool is shared, we can
     * define the share of the reward pool for the current contract (e.g. 20% for
     * a contract on Arbitrum and 80% on Base). The amount of stakes into this contract
     * cannot exceed the share of the total reward pool for this contract.
     * @param maxStakedShareForBuildersPool_ The new value.
     */
    function setMaxStakedShareForBuildersPool(uint256 maxStakedShareForBuildersPool_) external;

    /**
     * The function to set `minWithdrawLockPeriodAfterStake` variable
     * @dev Staker tokens locked for this period (at least) after the stake.
     * @param minWithdrawLockPeriodAfterStake_ The new value.
     */
    function setMinWithdrawLockPeriodAfterStake(uint256 minWithdrawLockPeriodAfterStake_) external;

    /**
     * The function to disable `isAllowStakesFromOtherAccounts` variable
     * @dev This parameter is needed to migrate tokens from V1.
     * It should be turned off after the migration is complete, because a restake from
     * other accounts will update the power factor, which may not be desirable.
     * @param value_ New value
     */
    function setIsMigrationOver(bool value_) external;

    /**
     * The function to create a Subnet.
     * @param subnet_ The Subnet data.
     * @param metadata_ The Subnet metadata.
     */
    function createSubnet(Subnet calldata subnet_, SubnetMetadata calldata metadata_) external;

    /**
     * The function to edit the Subnet metadata.
     * @param subnetId_ The Subnet ID.
     * @param metadata_ The Subnet metadata.
     */
    function editSubnetMetadata(bytes32 subnetId_, SubnetMetadata calldata metadata_) external;

    /**
     * The function to change the Subnet ownership.
     * @param subnetId_ The Subnet ID.
     * @param newValue_ The new Subnet ownership.
     */
    function setSubnetOwnership(bytes32 subnetId_, address newValue_) external;

    /**
     * The function to change the Subnet `minStake`.
     * @param subnetId_ The Subnet ID.
     * @param newValue_ The new minimal stake value.
     */
    function setSubnetMinStake(bytes32 subnetId_, uint256 newValue_) external;

    /**
     * The function to get the Subnet ID.
     * @param name_ The Subnet name.
     */
    function getSubnetId(string memory name_) external pure returns (bytes32);

    /**
     * The function to stake tokens to the Subnet.
     * @param subnetId_ The Subnet ID.
     * @param stakerAddress_ The Staker address.
     * @param amount_ The staked amount, wei.
     * @param claimLockEnd_ The claim lock end timestamp.
     */
    function stake(bytes32 subnetId_, address stakerAddress_, uint256 amount_, uint128 claimLockEnd_) external;

    /**
     * The function to withdraw tokens from the Subnet.
     * @param subnetId_ The Subnet ID.
     * @param amount_ The withdrawn amount, wei.
     */
    function withdraw(bytes32 subnetId_, uint256 amount_) external;

    /**
     * The function to claim rewards.
     * @param subnetId_ The Subnet ID.
     * @param stakerAddress_ The staker address.
     */
    function claim(bytes32 subnetId_, address stakerAddress_) external;

    /**
     * The function to receive the max total virtual stake for the current contract and network.
     * Used when Staker stake or withdraw, total stake can't exceed this result.
     * @param to_ To calculated timestamp
     */
    function getMaxTotalVirtualStaked(uint128 to_) external view returns (uint256);

    /**
     * The function to receive the Staker power factor.
     * @param subnetId_ The Subnet ID.
     * @param stakerAddress_ The staker address.
     */
    function getStakerPowerFactor(bytes32 subnetId_, address stakerAddress_) external view returns (uint256);

    /**
     * The function to receive power factor.
     * @param from_ The timestamp.
     * @param to_ The timestamp.
     */
    function getPowerFactor(uint128 from_, uint128 to_) external pure returns (uint256);

    /**
     * The function to receive the Staker rewards amount.
     * @param subnetId_ The Subnet ID.
     * @param stakerAddress_ The staker address.
     */
    function getStakerRewards(bytes32 subnetId_, address stakerAddress_) external view returns (uint256);

    /**
     * The function to calculate rewards for the period.
     * @param virtualStaked_ The staked amount * power factor.
     * @param from_ The timestamp.
     * @param to_ The timestamp.
     */
    function getPeriodRewardForStake(
        uint256 virtualStaked_,
        uint128 from_,
        uint128 to_
    ) external view returns (uint256);

    /**
     * The function to calculate Builder rewards from the Builder pool.
     * @param from_ The timestamp.
     * @param to_ The timestamp.
     */
    function getPeriodRewardForBuildersPool(uint128 from_, uint128 to_) external view returns (uint256);
}
