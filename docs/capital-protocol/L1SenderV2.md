# Solidity API

## L1SenderV2

### stETH

```solidity
address stETH
```

_stETH token address_

### distributor

```solidity
address distributor
```

_`Distributor` contract address._

### arbitrumBridgeConfig

```solidity
struct IL1SenderV2.ArbitrumBridgeConfig arbitrumBridgeConfig
```

_The config for Arbitrum bridge. Send wstETH to the Arbitrum_

### layerZeroConfig

```solidity
struct IL1SenderV2.LayerZeroConfig layerZeroConfig
```

_The config for LayerZero. Send MOR mint message to the Arbitrum_

### uniswapSwapRouter

```solidity
address uniswapSwapRouter
```

_UPGRADE `L1SenderV2` storage updates, add Uniswap integration_

### constructor

```solidity
constructor() public
```

### L1SenderV2__init

```solidity
function L1SenderV2__init() external
```

### supportsInterface

```solidity
function supportsInterface(bytes4 interfaceId_) external pure returns (bool)
```

### setStETh

```solidity
function setStETh(address value_) external
```

The function to set the stETH address

_Only for the contract `owner()`._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| value_ | address | stETH contract address |

### setDistributor

```solidity
function setDistributor(address value_) external
```

The function to set the `distributor` value

_Only for the contract `owner()`._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| value_ | address | stETH contract address |

### setUniswapSwapRouter

```solidity
function setUniswapSwapRouter(address value_) external
```

https://docs.uniswap.org/contracts/v3/reference/deployments/ethereum-deployments

### setLayerZeroConfig

```solidity
function setLayerZeroConfig(struct IL1SenderV2.LayerZeroConfig layerZeroConfig_) external
```

_https://docs.layerzero.network/v1/deployments/deployed-contracts
Gateway - see `EndpointV1` at the link
Receiver - `L2MessageReceiver` address
Receiver Chain Id - see `EndpointId` at the link
Zro Payment Address - the address of the ZRO token holder who would pay for the transaction
Adapter Params - parameters for custom functionality. e.g. receive airdropped native gas from the relayer on destination_

### sendMintMessage

```solidity
function sendMintMessage(address user_, uint256 amount_, address refundTo_) external payable
```

The function to send the reward token mint message to the `L1SenderV2`.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| user_ | address | The user's address receiver . |
| amount_ | uint256 | The amount of reward token to mint. |
| refundTo_ | address | The address to refund the overpaid gas. |

### setArbitrumBridgeConfig

```solidity
function setArbitrumBridgeConfig(struct IL1SenderV2.ArbitrumBridgeConfig newConfig_) external
```

_https://docs.arbitrum.io/build-decentralized-apps/reference/contract-addresses
wstETH - the wstETH token address
Gateway - see `L1 Gateway Router` at the link
Receiver - `L2MessageReceiver` address_

### sendWstETH

```solidity
function sendWstETH(uint256 gasLimit_, uint256 maxFeePerGas_, uint256 maxSubmissionCost_) external payable returns (bytes)
```

The function to send all current balance of the deposit token to the L2.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| gasLimit_ | uint256 | The gas limit for the L2 transaction. |
| maxFeePerGas_ | uint256 | The max fee per gas for the L2 transaction. |
| maxSubmissionCost_ | uint256 | The max submission cost for the L2 transaction. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bytes | The unique identifier for withdrawal. |

### swapExactInputMultihop

```solidity
function swapExactInputMultihop(address[] tokens_, uint24[] poolsFee_, uint256 amountIn_, uint256 amountOutMinimum_, uint256 deadline_) external returns (uint256)
```

_https://docs.uniswap.org/contracts/v3/guides/swaps/multihop-swaps

Multiple pool swaps are encoded through bytes called a `path`. A path is a sequence
of token addresses and poolFees that define the pools used in the swaps.
The format for pool encoding is (tokenIn, fee, tokenOut/tokenIn, fee, tokenOut) where
tokenIn/tokenOut parameter is the shared token across the pools.
Since we are swapping DAI to USDC and then USDC to WETH9 the path encoding is (DAI, 0.3%, USDC, 0.3%, WETH9)._

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

