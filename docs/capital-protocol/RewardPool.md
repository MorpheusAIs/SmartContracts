# Solidity API

## RewardPool

### rewardPools

```solidity
struct IRewardPool.RewardPool[] rewardPools
```

### constructor

```solidity
constructor() public
```

### RewardPool_init

```solidity
function RewardPool_init(struct IRewardPool.RewardPool[] poolsInfo_) external
```

### supportsInterface

```solidity
function supportsInterface(bytes4 interfaceId_) external pure returns (bool)
```

### addRewardPool

```solidity
function addRewardPool(struct IRewardPool.RewardPool rewardPool_) public
```

The function to add new `RewardPool`.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| rewardPool_ | struct IRewardPool.RewardPool | The `RewardPool` details. |

### isRewardPoolExist

```solidity
function isRewardPoolExist(uint256 index_) public view returns (bool)
```

The function to check, the reward pool exists or not.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| index_ | uint256 | The reward pool index. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True, when exists. |

### isRewardPoolPublic

```solidity
function isRewardPoolPublic(uint256 index_) public view returns (bool)
```

The function to check, the reward pool public or not.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| index_ | uint256 | The reward pool index. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True, when public. |

### onlyExistedRewardPool

```solidity
function onlyExistedRewardPool(uint256 index_) external view
```

The function to verify that reward pool exists.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| index_ | uint256 | The reward pool index. |

### onlyPublicRewardPool

```solidity
function onlyPublicRewardPool(uint256 index_) external view
```

The function to verify that reward pool public.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| index_ | uint256 | The reward pool index. |

### onlyNotPublicRewardPool

```solidity
function onlyNotPublicRewardPool(uint256 index_) external view
```

The function to verify that reward pool is not public.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| index_ | uint256 | The reward pool index. |

### getPeriodRewards

```solidity
function getPeriodRewards(uint256 index_, uint128 startTime_, uint128 endTime_) external view returns (uint256)
```

The function to calculate potential rewards.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| index_ | uint256 | The reward pool index. |
| startTime_ | uint128 | The start timestamp for potential rewards. |
| endTime_ | uint128 | The end timestamp for potential rewards. |

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

