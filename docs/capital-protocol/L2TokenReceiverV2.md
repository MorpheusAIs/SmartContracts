# Solidity API

## L2TokenReceiverV2

### router

```solidity
address router
```

The function to get the router address.

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |

### nonfungiblePositionManager

```solidity
address nonfungiblePositionManager
```

The function to get the nonfungible position manager address.

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |

### secondSwapParams

```solidity
struct IL2TokenReceiverV2.SwapParams secondSwapParams
```

### firstSwapParams

```solidity
struct IL2TokenReceiverV2.SwapParams firstSwapParams
```

### constructor

```solidity
constructor() public
```

### L2TokenReceiver__init

```solidity
function L2TokenReceiver__init(address router_, address nonfungiblePositionManager_, struct IL2TokenReceiverV2.SwapParams secondSwapParams_) external
```

### supportsInterface

```solidity
function supportsInterface(bytes4 interfaceId_) external pure returns (bool)
```

### editParams

```solidity
function editParams(struct IL2TokenReceiverV2.SwapParams newParams_, bool isEditFirstParams_) external
```

### withdrawToken

```solidity
function withdrawToken(address recipient_, address token_, uint256 amount_) external
```

The function to withdraw tokens from the contract.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| recipient_ | address | The address of the recipient. |
| token_ | address | The address of the token to withdraw. |
| amount_ | uint256 | The amount of tokens to withdraw. |

### withdrawTokenId

```solidity
function withdrawTokenId(address recipient_, address token_, uint256 tokenId_) external
```

The function to withdraw NFT token from the contract.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| recipient_ | address | The address of the recipient. |
| token_ | address | The address of the token to withdraw. |
| tokenId_ | uint256 | The ID of the token to withdraw. |

### swap

```solidity
function swap(uint256 amountIn_, uint256 amountOutMinimum_, uint256 deadline_, bool isUseFirstSwapParams_) external returns (uint256)
```

The function to swap current contract's tokens specified in the params.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| amountIn_ | uint256 | The amount of tokens to swap. |
| amountOutMinimum_ | uint256 | The minimum amount of tokens to receive. |
| deadline_ | uint256 | The deadline for the swap. |
| isUseFirstSwapParams_ | bool | The flag to indicate if the swapParams is initial. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The amount of tokens received. |

### increaseLiquidityCurrentRange

```solidity
function increaseLiquidityCurrentRange(uint256 tokenId_, uint256 amountAdd0_, uint256 amountAdd1_, uint256 amountMin0_, uint256 amountMin1_) external returns (uint128 liquidity_, uint256 amount0_, uint256 amount1_)
```

### collectFees

```solidity
function collectFees(uint256 tokenId_) external returns (uint256 amount0_, uint256 amount1_)
```

The function to collect fees from the position. The fees are not transferred to the caller.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| tokenId_ | uint256 | The ID of the position. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount0_ | uint256 | The amount of token0 collected. |
| amount1_ | uint256 | The amount of token1 collected. |

### version

```solidity
function version() external pure returns (uint256)
```

### onERC721Received

```solidity
function onERC721Received(address, address, uint256, bytes) external pure returns (bytes4)
```

### _getSwapParams

```solidity
function _getSwapParams(bool isUseFirstSwapParams_) internal view returns (struct IL2TokenReceiverV2.SwapParams)
```

### _authorizeUpgrade

```solidity
function _authorizeUpgrade(address) internal view
```

