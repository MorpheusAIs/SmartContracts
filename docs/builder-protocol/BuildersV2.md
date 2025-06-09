# Solidity API

## BuildersV2

### feeConfig

```solidity
address feeConfig
```

### buildersTreasury

```solidity
address buildersTreasury
```

### depositToken

```solidity
address depositToken
```

The function to get the address of deposit token.

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |

### editPoolDeadline

```solidity
uint128 editPoolDeadline
```

### minimalWithdrawLockPeriod

```solidity
uint256 minimalWithdrawLockPeriod
```

### totalPoolData

```solidity
struct IBuilders.TotalPoolData totalPoolData
```

### builderPools

```solidity
mapping(bytes32 => struct IBuilders.BuilderPool) builderPools
```

### buildersPoolData

```solidity
mapping(bytes32 => struct IBuilders.BuilderPoolData) buildersPoolData
```

### usersData

```solidity
mapping(address => mapping(bytes32 => struct IBuilders.UserData)) usersData
```

### poolExists

```solidity
modifier poolExists(bytes32 builderPoolId_)
```

### constructor

```solidity
constructor() public
```

### BuildersV2_init

```solidity
function BuildersV2_init(address depositToken_, address feeConfig_, address buildersTreasury_, uint128 editPoolDeadline_, uint256 minimalWithdrawLockPeriod_) external
```

### supportsInterface

```solidity
function supportsInterface(bytes4 interfaceId_) external pure returns (bool)
```

### setFeeConfig

```solidity
function setFeeConfig(address feeConfig_) public
```

The function to set the fee config address.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| feeConfig_ | address | The address of the fee config. |

### setBuildersTreasury

```solidity
function setBuildersTreasury(address buildersTreasury_) public
```

The function to set the builders treasury address.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| buildersTreasury_ | address | The address of the builders treasury. |

### setEditPoolDeadline

```solidity
function setEditPoolDeadline(uint128 editPoolDeadline_) public
```

The function to set the deadline for editing the pool.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| editPoolDeadline_ | uint128 | The deadline for editing the pool. |

### setMinimalWithdrawLockPeriod

```solidity
function setMinimalWithdrawLockPeriod(uint256 minimalWithdrawLockPeriod_) public
```

The function to set the minimal withdraw lock period.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| minimalWithdrawLockPeriod_ | uint256 | The minimal withdraw lock period. |

### createBuilderPool

```solidity
function createBuilderPool(struct IBuilders.BuilderPool builderPool_) public
```

The function to create a new pool.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| builderPool_ | struct IBuilders.BuilderPool | The pool's data. |

### editBuilderPool

```solidity
function editBuilderPool(struct IBuilders.BuilderPool builderPool_) external
```

The function to edit the pool's data.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| builderPool_ | struct IBuilders.BuilderPool | The new pool's data. |

### deposit

```solidity
function deposit(bytes32 builderPoolId_, uint256 amount_) external
```

The function to deposit tokens in the public pool.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| builderPoolId_ | bytes32 | The pool's id. |
| amount_ | uint256 | The amount of tokens to deposit. |

### withdraw

```solidity
function withdraw(bytes32 builderPoolId_, uint256 amount_) external
```

The function to withdraw tokens from the pool.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| builderPoolId_ | bytes32 | The pool's id. |
| amount_ | uint256 | The amount of tokens to withdraw. |

### claim

```solidity
function claim(bytes32 builderPoolId_, address receiver_) external
```

The function to claim rewards from the pool.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| builderPoolId_ | bytes32 | The pool's id. |
| receiver_ | address | The receiver's address. |

### _updatePoolData

```solidity
function _updatePoolData(bytes32 builderPoolId_, uint256 newDeposited_, struct IBuilders.UserData userData) internal
```

### getNotDistributedRewards

```solidity
function getNotDistributedRewards() public view returns (uint256)
```

### getCurrentUserMultiplier

```solidity
function getCurrentUserMultiplier(bytes32 builderPoolId_, address user_) public view returns (uint256)
```

The function to get the current user multiplier.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| builderPoolId_ | bytes32 | The pool's id. |
| user_ | address | The user's address. |

### getCurrentBuilderReward

```solidity
function getCurrentBuilderReward(bytes32 builderPoolId_) external view returns (uint256)
```

The function to get the builder's reward.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| builderPoolId_ | bytes32 | The pool's id. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The user's reward amount. |

### getLockPeriodMultiplier

```solidity
function getLockPeriodMultiplier(uint128 lockStart_, uint128 lockEnd_) public pure returns (uint256)
```

### _validateBuilderPool

```solidity
function _validateBuilderPool(struct IBuilders.BuilderPool builderPool_) internal view
```

### _getFee

```solidity
function _getFee(uint256 amount_, bytes32 operation_) internal view returns (uint256, address)
```

### _getCurrentBuilderReward

```solidity
function _getCurrentBuilderReward(uint256 currentRate_, struct IBuilders.BuilderPoolData builderPoolData_) internal pure returns (uint256)
```

### getPoolId

```solidity
function getPoolId(string builderPoolName_) public pure returns (bytes32)
```

### _authorizeUpgrade

```solidity
function _authorizeUpgrade(address) internal view
```

### version

```solidity
function version() external pure returns (uint256)
```

