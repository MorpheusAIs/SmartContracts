# Solidity API

## ChainLinkDataConsumer

_https://docs.chain.link/data-feeds/getting-started_

### dataFeeds

```solidity
mapping(bytes32 => address[]) dataFeeds
```

### constructor

```solidity
constructor() public
```

### ChainLinkDataConsumer_init

```solidity
function ChainLinkDataConsumer_init() external
```

The function to initialize the contract.

_Used by admins, once._

### supportsInterface

```solidity
function supportsInterface(bytes4 interfaceId_) external pure returns (bool)
```

### updateDataFeeds

```solidity
function updateDataFeeds(string[] paths_, address[][] feeds_) external
```

_https://docs.chain.link/data-feeds/price-feeds/addresses?network=ethereum&page=1_

### getPathId

```solidity
function getPathId(string path_) public pure returns (bytes32)
```

The function to get the path ID.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| path_ | string | The path like 'wETH/USD' |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bytes32 | The path ID. |

### decimals

```solidity
function decimals() public pure returns (uint8)
```

### getChainLinkDataFeedLatestAnswer

```solidity
function getChainLinkDataFeedLatestAnswer(bytes32 pathId_) external view returns (uint256)
```

The function to get the token price.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| pathId_ | bytes32 | The path ID. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The asset price. |

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

