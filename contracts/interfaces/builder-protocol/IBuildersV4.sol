// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

/**
 * @title IBuildersV4
 * @notice Defines the basic interface for the `BuildersV4`
 */
interface IBuildersV4 is IERC165 {
    event FeeConfigSet(address feeConfig);
    event BuildersTreasurySet(address buildersTreasury);
    event MinimalWithdrawLockPeriodSet(uint256 minimalWithdrawLockPeriod);
    event RewardPoolSet(address rewardPool);
    event NetworkShareOwnerSet(address networkShareOwner);
    event NetworkShareSet(uint256 networkShare);
    event SubnetCreationFeeAmountSet(uint256 subnetCreationFeeAmount);

    event SubnetCreated(bytes32 indexed subnetId, Subnet subnet);
    event SubnetEdited(bytes32 indexed subnetId_, Subnet subnet);
    event SubnetMetadataEdited(bytes32 indexed subnetId_, SubnetMetadata metadata_);
    event UserDeposited(bytes32 indexed subnetId, address indexed user, uint256 amount);
    event AdminClaimed(bytes32 indexed subnetId, address receiver, uint256 amount);
    event UserWithdrawn(bytes32 indexed subnetId, address indexed user, uint256 amount);
    event FeePaid(address indexed user, bytes32 indexed operation, uint256 amount, address treasury);

    /**
     * @notice The structure that stores the main data input for the Subnet.
     * @param name The name of the Subnet.
     * @param admin The address of the admin.
     * @param unusedStorage1_V4Update (old `poolStart`) The timestamp when the pool opens. Deprecated in V4.
     * @param withdrawLockPeriodAfterDeposit The period in seconds when the user can't withdraw his deposit.
     * @param unusedStorage2_V4Update (old `claimLockEnd`) The timestamp when the admin can claim his rewards. Deprecated in V4.
     * @param minimalDeposit The minimal deposit amount.
     * @param claimAdmin This address can claim the Subnet rewards against `admin`.
     */
    struct Subnet {
        string name;
        address admin;
        uint128 unusedStorage1_V4Update;
        uint128 withdrawLockPeriodAfterDeposit;
        uint128 unusedStorage2_V4Update;
        uint256 minimalDeposit;
        address claimAdmin;
    }

    /**
     * @notice The structure that stores the main metadata input for the Subnet.
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
     * @notice The structure that stores the internal contract data for the Subnet.
     * @param unusedStorage1_V4Update (old `lastDeposit`) The timestamp when the user last deposited tokens. Deprecated in V4.
     * @param deposited The amount of tokens deposited in the pool without users multiplier.
     * @param unusedStorage2_V4Update (old `virtualDeposited`) The amount of tokens deposited in the pool with multipliers. Deprecated in V4.
     * @param rate The current reward rate.
     * @param pendingRewards Number of rewards accrued to the Subnet. Is not the final reward at a given time. Used for internal calculations.
     */
    struct SubnetData {
        uint128 unusedStorage1_V4Update;
        uint256 deposited;
        uint256 unusedStorage2_V4Update;
        uint256 rate;
        uint256 pendingRewards;
    }

    /**
     * @notice The structure that stores all Subnets data.
     * @param unusedStorage1_V4Update (old `distributedRewards`) The amount of rewards at the last update. Deprecated in V4.
     * @param rate The current reward rate.
     * @param totalDeposited The total amount of tokens deposited in the Subnets.
     * @param unusedStorage2_V4Update (old `totalVirtualDeposited`) The total amount of tokens deposited in the pool with multiplier. Deprecated in V4.
     */
    struct AllSubnetsData {
        uint256 unusedStorage1_V4Update;
        uint256 rate;
        uint256 totalDeposited;
        uint256 unusedStorage2_V4Update;
    }

    /**
     * @notice The structure that stores all Subnets data, addition for `AllSubnetsData`.
     * @param distributedRewards The amount of rewards that calculated and virtually distributed between Subnets.
     * @param undistributedRewards The amount of rewards that calculated and stored for the contract owner.
     * @param claimedRewards The total amount of claimed rewards.
     * @param lastUpdate The `AllSubnetsData.rate` last update timestamp.
     */
    struct AllSubnetsDataV4 {
        uint256 distributedRewards;
        uint256 undistributedRewards;
        uint256 claimedRewards;
        uint128 lastUpdate;
    }

    /**
     * @notice The structure that stores the user's data for the Subnet.
     * @param lastDeposit The timestamp when the user last deposited tokens.
     * @param unusedStorage1_V4Update (old `claimLockStart`) The timestamp when the user locked his tokens. Deprecated in V4.
     * @param deposited The amount of tokens deposited in the Subnet.
     * @param unusedStorage2_V4Update (old `virtualDeposited`) The amount of tokens deposited in the pool with multipliers. Deprecated in V4.
     */
    struct UserData {
        uint128 lastDeposit;
        uint128 unusedStorage1_V4Update;
        uint256 deposited;
        uint256 unusedStorage2_V4Update;
    }

    /**
     * @notice The function to get the address of deposit token (MOR).
     * @return The address of deposit token.
     */
    function depositToken() external view returns (address);

    /**
     * @notice The function to get the `FeeConfig` contract address.
     * @return The `FeeConfig` contract address.
     */
    function feeConfig() external view returns (address);

    /**
     * @notice The function to get the `BuildersTreasury` contract address.
     * @return The `BuildersTreasury` contract address.
     */
    function buildersTreasury() external view returns (address);

    /**
     * @notice After the `deposit()`, the user can't `withdraw()`
     * their funds for the `minimalWithdrawLockPeriod` in seconds.
     * @return The seconds value.
     */
    function minimalWithdrawLockPeriod() external view returns (uint256);

    /**
     * @notice The function to get the `RewardPool` contract address.
     * @return The `RewardPool` contract address.
     */
    function rewardPool() external view returns (address);

    /**
     * @notice `subnetCreationFeeAmount` is taken from the `_msgSender()` when the Subnet created.
     * @return The amount of tokens in wei.
     */
    function subnetCreationFeeAmount() external view returns (uint256);

    /**
     * @notice The `networkShare` is the share of the network rewards that will be distributed to Subnets,
     * e.g. 100% = 1e25. If global reward curve return `X` amount of rewards, then all Subnets will
     * receive `X * networkShare / 1e25`
     * @return The share value, where 100% = 1e25.
     */
    function networkShare() external view returns (uint256);

    /**
     * @notice The `networkShareOwner` address can change the `networkShare` value.
     * @return The address that can change the `networkShare` value.
     */
    function networkShareOwner() external view returns (address);

    /**
     * @notice The function to set the `FeeConfig` contract address.
     * @dev Only for the contract owner.
     * @param feeConfig_ The address of the `FeeConfig`.
     */
    function setFeeConfig(address feeConfig_) external;

    /**
     * @notice The function to set the `BuildersTreasuryV2` contract address.
     * @dev Only for the contract owner.
     * @param buildersTreasury_ The address of the `BuildersTreasuryV2`.
     */
    function setBuildersTreasury(address buildersTreasury_) external;

    /**
     * @notice The function to set the `minimalWithdrawLockPeriod` value.
     * @dev Only for the contract owner.
     * @param minimalWithdrawLockPeriod_ The value in seconds.
     */
    function setMinimalWithdrawLockPeriod(uint256 minimalWithdrawLockPeriod_) external;

    /**
     * @notice The function to set the `RewardPool` contract address.
     * @dev Only for the contract owner.
     * @param rewardPool_ The address of the `RewardPool`.
     */
    function setRewardPool(address rewardPool_) external;

    /**
     * @notice The function to set the `networkShareOwner` address.
     * @dev Only for the contract owner.
     * @param networkShareOwner_ This address will be able to change the `networkShare` value.
     */
    function setNetworkShareOwner(address networkShareOwner_) external;

    /**
     * @notice The function to set the `networkShare` value.
     * @dev Only for the contract owner or `networkShareOwner`.
     * @param networkShare_ The percent value, where 100% = 1e25.
     */
    function setNetworkShare(uint256 networkShare_) external;

    /**
     * @notice The function to set the `subnetCreationFeeAmount` value.
     * @dev Only for the contract owner.
     * @param subnetCreationFeeAmount_ The token amount in wei.
     */
    function setSubnetCreationFeeAmount(uint256 subnetCreationFeeAmount_) external;

    /**
     * @notice The function to create the Subnet.
     * @param subnet_ The `Subnet` struct.
     * @param metadata_ The `SubnetMetadata` struct.
     */
    function createSubnet(Subnet calldata subnet_, SubnetMetadata calldata metadata_) external;

    /**
     * @notice The function to edit the Subnet.
     * @dev Only for the Subnet admin.
     * @param subnetId_ The Subnet ID.
     * @param newSubnet_ The `Subnet` struct.
     */
    function editSubnet(bytes32 subnetId_, Subnet calldata newSubnet_) external;

    /**
     * @notice The function to edit the Subnet metadata.
     * @dev Only for the Subnet admin.
     * @param subnetId_ The Subnet ID.
     * @param metadata_ The `SubnetMetadata` struct.
     */
    function editSubnetMetadata(bytes32 subnetId_, SubnetMetadata calldata metadata_) external;

    /**
     * @notice The function to get the v4 Subnet ID.
     * @param subnetName_ The Subnet name.
     */
    function getSubnetId(string memory subnetName_) external view returns (bytes32);

    /**
     * @notice The function to get the v2 Subnet ID.
     * @param subnetName_ The Subnet name.
     */
    function getSubnetIdOld(string memory subnetName_) external pure returns (bytes32);

    /**
     * @notice The function to stake tokens to the Subnet.
     * @param subnetId_ The Subnet ID.
     * @param amount_ The staked amount, wei.
     */
    function deposit(bytes32 subnetId_, uint256 amount_) external;

    /**
     * @notice The function to withdraw tokens from the Subnet.
     * @param subnetId_ The Subnet ID.
     * @param amount_ The withdrawn amount, wei.
     */
    function withdraw(bytes32 subnetId_, uint256 amount_) external;

    /**
     * @notice The function to claim rewards.
     * @dev Only for the Subnet admin.
     * @param subnetId_ The Subnet ID.
     * @param receiver_ The rewards receiver address.
     */
    function claim(bytes32 subnetId_, address receiver_) external;

    /**
     * @notice The function calculates the potential reward amount for ALL Subnets
     * at the current moment in time, based on the current contract parameters.
     * It estimates the unclaimed rewards that would be distributed if a claim were made now.
     * @return The reward amount in wei.
     */
    function getCurrentSubnetsRewards() external view returns (uint256);

    /**
     * @notice The function calculates the potential reward amount for SPECIFIC Subnets
     * at the current moment in time, based on the current contract parameters.
     * It estimates the unclaimed rewards that would be distributed if a claim were made now.
     * @return The reward amount in wei.
     */
    function getCurrentSubnetRewards(bytes32 subnetId_) external view returns (uint256);

    /**
     * @notice The function to get the contract version.
     * @return The current contract version.
     */
    function version() external pure returns (uint256);
}
