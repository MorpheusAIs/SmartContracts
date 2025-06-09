# Solidity API

## BuilderSubnets

### feeConfig

```solidity
address feeConfig
```

The contract address that support `IFeeConfig` interface

### token

```solidity
address token
```

Stake and reward token (MOR)

### treasury

```solidity
address treasury
```

The rewards on `claim()` are taken from this address

### minWithdrawLockPeriodAfterStake

```solidity
uint256 minWithdrawLockPeriodAfterStake
```

The staker tokens locked for withdraw for this period (at least) after the stake

### subnetCreationFeeAmount

```solidity
uint256 subnetCreationFeeAmount
```

`subnetCreationFeeAmount` is taken from the Builder when the Subnet is created and sent to the `subnetCreationFeeTreasury`

### subnetCreationFeeTreasury

```solidity
address subnetCreationFeeTreasury
```

### rewardCalculationStartsAt

```solidity
uint128 rewardCalculationStartsAt
```

This variable is required for calculations, it sets the time at which
the calculation of rewards will start. That is, before this time the rewards
will not be calculated.

### isMigrationOver

```solidity
bool isMigrationOver
```

This parameter is needed to migrate stakes from V1.
It should be turned off after the migration is complete, because a restake from
other accounts will update the power factor, which may not be desirable. Also,
subnet creation can't be in the past.

### buildersV3

```solidity
address buildersV3
```

The `BuildersV3` contract address

### buildersRewardPoolData

```solidity
struct IBuilderSubnets.BuildersRewardPoolData buildersRewardPoolData
```

### allSubnetsData

```solidity
struct IBuilderSubnets.AllSubnetsData allSubnetsData
```

### subnets

```solidity
mapping(bytes32 => struct IBuilderSubnets.Subnet) subnets
```

### subnetsMetadata

```solidity
mapping(bytes32 => struct IBuilderSubnets.SubnetMetadata) subnetsMetadata
```

### subnetsData

```solidity
mapping(bytes32 => struct IBuilderSubnets.SubnetData) subnetsData
```

### stakers

```solidity
mapping(bytes32 => mapping(address => struct IBuilderSubnets.Staker)) stakers
```

### FEE_WITHDRAW_OPERATION

```solidity
bytes32 FEE_WITHDRAW_OPERATION
```

### FEE_CLAIM_OPERATION

```solidity
bytes32 FEE_CLAIM_OPERATION
```

### onlyExistedSubnet

```solidity
modifier onlyExistedSubnet(bytes32 subnetId_)
```

### onlySubnetOwner

```solidity
modifier onlySubnetOwner(bytes32 subnetId_)
```

### constructor

```solidity
constructor() public
```

### BuilderSubnets_init

```solidity
function BuilderSubnets_init(address token_, address feeConfig_, address treasury_, uint256 minWithdrawLockPeriodAfterStake_, address buildersV3_) external
```

The function to initialize the contract.

_Used only once._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| token_ | address | See the `token` description. |
| feeConfig_ | address | See the `feeConfig` description. |
| treasury_ | address | See the `treasury` description. |
| minWithdrawLockPeriodAfterStake_ | uint256 | See the `minWithdrawLockPeriodAfterStake` description. |
| buildersV3_ | address | See the `buildersV3` description. |

### supportsInterface

```solidity
function supportsInterface(bytes4 interfaceId_) external pure returns (bool)
```

### setFeeConfig

```solidity
function setFeeConfig(address feeConfig_) public
```

The function to set the `FeeConfig` contract address.

_Only for the contract `owner()`._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| feeConfig_ | address | The address of the new `FeeConfig`. |

### setTreasury

```solidity
function setTreasury(address treasury_) public
```

The function to set the treasury address.

_Rewards are taken from this address. Only for the contract `owner()`._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| treasury_ | address | The new value. |

### setBuildersRewardPoolData

```solidity
function setBuildersRewardPoolData(struct IBuilderSubnets.BuildersRewardPoolData buildersRewardPoolData_) external
```

The function to set the `buildersRewardPoolData` variable. Can be taken from the mainnet
contract on the Ethereum network.

_Only for the contract `owner()`._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| buildersRewardPoolData_ | struct IBuilderSubnets.BuildersRewardPoolData | The new value. |

### setRewardCalculationStartsAt

```solidity
function setRewardCalculationStartsAt(uint128 rewardCalculationStartsAt_) external
```

The function to set `rewardCalculationStartsAt` variable

_This variable is required for calculations, it sets the time at which
the calculation of rewards will start. That is, before this time the rewards
will not be calculated. Only for the contract `owner()`._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| rewardCalculationStartsAt_ | uint128 | The new value. |

### setMinWithdrawLockPeriodAfterStake

```solidity
function setMinWithdrawLockPeriodAfterStake(uint256 minWithdrawLockPeriodAfterStake_) public
```

The function to set `minWithdrawLockPeriodAfterStake` variable

_Staker tokens locked for this period (at least) after the stake. Only for the contract `owner()`._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| minWithdrawLockPeriodAfterStake_ | uint256 | The new value. |

### setSubnetCreationFee

```solidity
function setSubnetCreationFee(uint256 subnetCreationFeeAmount_, address subnetCreationFeeTreasury_) external
```

### setIsMigrationOver

```solidity
function setIsMigrationOver(bool value_) external
```

The function to disable `isAllowStakesFromOtherAccounts` variable

_This parameter is needed to migrate tokens from V3. Only for the contract `owner()`._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| value_ | bool | New value |

### createSubnet

```solidity
function createSubnet(struct IBuilderSubnets.Subnet subnet_, struct IBuilderSubnets.SubnetMetadata metadata_) external
```

The function to create a Subnet.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| subnet_ | struct IBuilderSubnets.Subnet | The Subnet data. |
| metadata_ | struct IBuilderSubnets.SubnetMetadata | The Subnet metadata. |

### editSubnetMetadata

```solidity
function editSubnetMetadata(bytes32 subnetId_, struct IBuilderSubnets.SubnetMetadata metadata_) external
```

The function to edit the Subnet metadata.

_Only for the Subnet owner._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| subnetId_ | bytes32 | The Subnet ID. |
| metadata_ | struct IBuilderSubnets.SubnetMetadata | The Subnet metadata. |

### setSubnetOwnership

```solidity
function setSubnetOwnership(bytes32 subnetId_, address newValue_) external
```

The function to change the Subnet ownership.

_Only for the Subnet owner._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| subnetId_ | bytes32 | The Subnet ID. |
| newValue_ | address | The new Subnet ownership. |

### setSubnetMinStake

```solidity
function setSubnetMinStake(bytes32 subnetId_, uint256 newValue_) external
```

The function to change the Subnet `minStake`.

_Only for the Subnet owner._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| subnetId_ | bytes32 | The Subnet ID. |
| newValue_ | uint256 | The new minimal stake value. |

### setSubnetFee

```solidity
function setSubnetFee(bytes32 subnetId_, uint256 newValue_) external
```

The function to change the Subnet `fee`. The value cannot be increased.

_Only for the Subnet owner._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| subnetId_ | bytes32 | The Subnet ID. |
| newValue_ | uint256 | The new fee value. |

### setSubnetFeeTreasury

```solidity
function setSubnetFeeTreasury(bytes32 subnetId_, address newValue_) external
```

The function to change the Subnet `feeTreasury`.

_Only for the Subnet owner._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| subnetId_ | bytes32 | The Subnet ID. |
| newValue_ | address | The new fee treasury value. |

### getSubnetId

```solidity
function getSubnetId(string name_) public pure returns (bytes32)
```

The function to get the Subnet ID.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| name_ | string | The Subnet name. |

### stake

```solidity
function stake(bytes32 subnetId_, address stakerAddress_, uint256 amount_) external
```

The function to stake tokens to the Subnet.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| subnetId_ | bytes32 | The Subnet ID. |
| stakerAddress_ | address | The Staker address. |
| amount_ | uint256 | The staked amount, wei. |

### withdraw

```solidity
function withdraw(bytes32 subnetId_, uint256 amount_) external
```

The function to withdraw tokens from the Subnet.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| subnetId_ | bytes32 | The Subnet ID. |
| amount_ | uint256 | The withdrawn amount, wei. |

### claim

```solidity
function claim(bytes32 subnetId_, address stakerAddress_) external
```

The function to claim rewards.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| subnetId_ | bytes32 | The Subnet ID. |
| stakerAddress_ | address | The staker address. |

### collectPendingRewards

```solidity
function collectPendingRewards(uint128 to_) external
```

_With claiming, there can be so many calculation periods that a transaction
won't fit into a block. In this case, we can use this function to calculate
rewards in parts._

### _updateStorage

```solidity
function _updateStorage(bytes32 subnetId_, address stakerAddress_, uint256 newStaked_) internal
```

### getStakerRewards

```solidity
function getStakerRewards(bytes32 subnetId_, address stakerAddress_) external view returns (uint256)
```

The function to receive the latest Staker rewards amount.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| subnetId_ | bytes32 | The Subnet ID. |
| stakerAddress_ | address | The staker address. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The rewards amount. |

### collectRewardRate

```solidity
function collectRewardRate(uint256 staked_, uint128 from_, uint128 to_) public view returns (uint256, uint256)
```

_Rewards are calculated in computation periods that are less than or equal to one day from the last
calculated timestamp. For example, if the stake was 2 days 3 hours, there will be 3 calculation periods,
2 for 1 day and 1 for 3 hours._

### getBuildersPoolEmission

```solidity
function getBuildersPoolEmission(uint128 from_, uint128 to_) public view returns (uint256)
```

The function to calculate rewards from the Builder pool.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| from_ | uint128 | The timestamp. |
| to_ | uint128 | The timestamp. |

### version

```solidity
function version() external pure returns (uint256)
```

The function to get the contract version.

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The current contract version |

### _authorizeUpgrade

```solidity
function _authorizeUpgrade(address) internal view
```

