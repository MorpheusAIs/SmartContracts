# Solidity API

## Distributor

### depositPools

```solidity
mapping(uint256 => mapping(address => struct IDistributor.DepositPool)) depositPools
```

_`reward_pool_index` => `deposit_pool_address` => `DepositPool`_

### distributedRewards

```solidity
mapping(uint256 => mapping(address => uint256)) distributedRewards
```

_`reward_pool_index` => `deposit_pool_address` => `rewards`_

### depositPoolAddresses

```solidity
mapping(uint256 => address[]) depositPoolAddresses
```

_`reward_pool_index` => `deposit_pool_addresses`_

### rewardPoolLastCalculatedTimestamp

```solidity
mapping(uint256 => uint128) rewardPoolLastCalculatedTimestamp
```

### isPrivateDepositPoolAdded

```solidity
mapping(uint256 => bool) isPrivateDepositPoolAdded
```

### chainLinkDataConsumer

```solidity
address chainLinkDataConsumer
```

_The variable contain `ChainLinkDataConsumer` contract address.
Is used to obtain prices._

### rewardPool

```solidity
address rewardPool
```

_The variable contain `RewardPool` contract address.
Is used to obtain reward amount._

### l1Sender

```solidity
address l1Sender
```

_The variable contain `` contract address.
Used to send messages to the token's mint and yield transfer._

### aavePool

```solidity
address aavePool
```

_https://aave.com/docs/resources/addresses
See `Pool` and `AaveProtocolDataProvider`_

### aavePoolDataProvider

```solidity
address aavePoolDataProvider
```

The function to receive the Aave `AaveProtocolDataProvider` contract address.

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |

### undistributedRewards

```solidity
uint256 undistributedRewards
```

_This variable contain undistributed rewards, e.g. the situation
when the yield from all deposit pools are zero._

### minRewardsDistributePeriod

```solidity
uint256 minRewardsDistributePeriod
```

The function to receive the minimal rewards distribute period.

_Accrual of rewards is done in intervals, the minimum interval is stored here._

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |

### constructor

```solidity
constructor() public
```

### Distributor_init

```solidity
function Distributor_init(address chainLinkDataConsumer_, address aavePool_, address aavePoolDataProvider_, address rewardPool_, address l1Sender_) external
```

### supportsInterface

```solidity
function supportsInterface(bytes4 interfaceId_) external pure returns (bool)
```

### setChainLinkDataConsumer

```solidity
function setChainLinkDataConsumer(address value_) public
```

The function to set the `ChainLinkDataConsumer` contract.

_Only for the contract `owner()`._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| value_ | address | The `ChainLinkDataConsumer` address. |

### setL1Sender

```solidity
function setL1Sender(address value_) public
```

### setAavePool

```solidity
function setAavePool(address value_) public
```

_https://aave.com/docs/resources/addresses. See `Pool`._

### setAavePoolDataProvider

```solidity
function setAavePoolDataProvider(address value_) public
```

_https://aave.com/docs/resources/addresses. See `AaveProtocolDataProvider`._

### setRewardPool

```solidity
function setRewardPool(address value_) public
```

The function to set the `RewardPool` contract.

_Only for the contract `owner()`._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| value_ | address | The `RewardPool` address. |

### setMinRewardsDistributePeriod

```solidity
function setMinRewardsDistributePeriod(uint256 value_) public
```

### setRewardPoolLastCalculatedTimestamp

```solidity
function setRewardPoolLastCalculatedTimestamp(uint256 rewardPoolIndex_, uint128 value_) public
```

### addDepositPool

```solidity
function addDepositPool(uint256 rewardPoolIndex_, address depositPoolAddress_, address token_, string chainLinkPath_, enum IDistributor.Strategy strategy_) external
```

The function to add new `DepositPool`.

_Only for the contract `owner()`._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| rewardPoolIndex_ | uint256 | The reward pool index. |
| depositPoolAddress_ | address | The `DepositPool` contract address. |
| token_ | address | The yield token for the `DepositPool` contract. |
| chainLinkPath_ | string | The path from the `ChainLinkDataConsumer`. |
| strategy_ | enum IDistributor.Strategy | The `Strategy`. |

### updateDepositTokensPrices

```solidity
function updateDepositTokensPrices(uint256 rewardPoolIndex_) public
```

The function to update the token prices.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| rewardPoolIndex_ | uint256 | The reward pool index. |

### supply

```solidity
function supply(uint256 rewardPoolIndex_, uint256 amount_) external
```

The function to supply tokens to the contract.

_Only for deposit pools_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| rewardPoolIndex_ | uint256 | The reward pool index. |
| amount_ | uint256 | The token amount. |

### withdraw

```solidity
function withdraw(uint256 rewardPoolIndex_, uint256 amount_) external returns (uint256)
```

The function to withdraw tokens from the contract.

_Only for deposit pools_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| rewardPoolIndex_ | uint256 | The reward pool index. |
| amount_ | uint256 | The token amount. |

### distributeRewards

```solidity
function distributeRewards(uint256 rewardPoolIndex_) public
```

The function to distribute rewards based on the tokens yield.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| rewardPoolIndex_ | uint256 | The reward pool index. |

### withdrawYield

```solidity
function withdrawYield(uint256 rewardPoolIndex_, address depositPoolAddress_) external
```

The function to withdraw the yield.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| rewardPoolIndex_ | uint256 | The reward pool index. |
| depositPoolAddress_ | address | The `DepositPool` contract address. |

### withdrawUndistributedRewards

```solidity
function withdrawUndistributedRewards(address user_, address refundTo_) external payable
```

The function to withdraw undistributed rewards.

_Only for the contract `owner()`._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| user_ | address | The rewards receiver address. |
| refundTo_ | address | The address to refund the overpaid gas. |

### sendMintMessage

```solidity
function sendMintMessage(uint256 rewardPoolIndex_, address user_, uint256 amount_, address refundTo_) external payable
```

_Used as a universal proxy for all `DepositPool` so that the `msg.sender` of the message to the
reward mint is one._

### getDistributedRewards

```solidity
function getDistributedRewards(uint256 rewardPoolIndex_, address depositPoolAddress_) external view returns (uint256)
```

The function to get the distributed rewards.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| rewardPoolIndex_ | uint256 | The reward pool index. |
| depositPoolAddress_ | address | The `DepositPool` contract address. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Distributed rewards amount. |

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

