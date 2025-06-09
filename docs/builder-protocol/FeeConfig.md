# Solidity API

## FeeConfig

### constructor

```solidity
constructor() public
```

### FeeConfig_init

```solidity
function FeeConfig_init(address treasury_, uint256 baseFee_) external
```

The function that initializes the contract.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| treasury_ | address | The treasury address. |
| baseFee_ | uint256 | The base fee. |

### supportsInterface

```solidity
function supportsInterface(bytes4 interfaceId_) external pure returns (bool)
```

### setFee

```solidity
function setFee(address sender_, uint256 fee_) external
```

The function that sets the fee for the sender.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| sender_ | address | The sender address. |
| fee_ | uint256 | The fee. |

### setFeeForOperation

```solidity
function setFeeForOperation(address sender_, bytes32 operation_, uint256 fee_) external
```

The function that sets the fee for the sender for the operation.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| sender_ | address | The sender address. |
| operation_ | bytes32 | The operation. |
| fee_ | uint256 | The fee. |

### discardCustomFee

```solidity
function discardCustomFee(address sender_, bytes32 operation_) external
```

The function that discards the fee for the sender for the operation.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| sender_ | address | The sender address. |
| operation_ | bytes32 | The operation. |

### setTreasury

```solidity
function setTreasury(address treasury_) public
```

The function that sets the treasury address.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| treasury_ | address | The treasury address. |

### setBaseFee

```solidity
function setBaseFee(uint256 baseFee_) public
```

The function that sets the base fee.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| baseFee_ | uint256 | The base fee. |

### setBaseFeeForOperation

```solidity
function setBaseFeeForOperation(bytes32 operation_, uint256 baseFeeForOperation_) public
```

The function that sets the fee for the sender for the operation.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| operation_ | bytes32 | The operation. |
| baseFeeForOperation_ | uint256 | The base fee for the operation. |

### getFeeAndTreasury

```solidity
function getFeeAndTreasury(address sender_) external view returns (uint256, address)
```

The function that returns the fee and treasury address for the sender.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| sender_ | address | The sender address. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The fee. |
| [1] | address | The treasury address. |

### getFeeAndTreasuryForOperation

```solidity
function getFeeAndTreasuryForOperation(address sender_, bytes32 operation_) external view returns (uint256, address)
```

The function that returns the fee and treasury address for the sender for the operation.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| sender_ | address | The sender address. |
| operation_ | bytes32 | The operation. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | The fee. |
| [1] | address | The treasury address. |

### _authorizeUpgrade

```solidity
function _authorizeUpgrade(address) internal view
```

