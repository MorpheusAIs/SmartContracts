# Solidity API

## BuildersTreasury

### rewardToken

```solidity
address rewardToken
```

The function that returns the reward token address (MOR).

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |

### builders

```solidity
address builders
```

The function that returns the `BuildersV...` contract address.

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |

### distributedRewards

```solidity
uint256 distributedRewards
```

### onlyBuilders

```solidity
modifier onlyBuilders()
```

### constructor

```solidity
constructor() public
```

### BuildersTreasury_init

```solidity
function BuildersTreasury_init(address rewardToken_, address builders_) external
```

### supportsInterface

```solidity
function supportsInterface(bytes4 interfaceId_) external pure returns (bool)
```

### setBuilders

```solidity
function setBuilders(address builders_) public
```

The function that sets the `BuildersV...` contract address.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| builders_ | address | The address of the `BuildersV...` contract. |

### sendRewards

```solidity
function sendRewards(address receiver_, uint256 amount_) external
```

The function that sends the reward to the receiver.

_The caller should be a `BuildersV...` contract._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| receiver_ | address | The address of the receiver. |
| amount_ | uint256 | The amount of the reward. |

### getAllRewards

```solidity
function getAllRewards() public view returns (uint256)
```

The function that returns all rewards.

_It calculates the total rewards by adding the balance of the reward token and the distributed rewards._

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The reward amount. |

### _authorizeUpgrade

```solidity
function _authorizeUpgrade(address) internal view
```

