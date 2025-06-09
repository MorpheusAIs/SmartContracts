# Solidity API

## MOROFT

The token is ERC20 with burnable and Layer Zero OFT features.

### isMinter

```solidity
mapping(address => bool) isMinter
```

### constructor

```solidity
constructor(address layerZeroEndpoint_, address delegate_, address minter_) public
```

### supportsInterface

```solidity
function supportsInterface(bytes4 interfaceId_) external pure returns (bool)
```

_Returns true if this contract implements the interface defined by
`interfaceId`. See the corresponding
https://eips.ethereum.org/EIPS/eip-165#how-interfaces-are-identified[EIP section]
to learn more about how these ids are created.

This function call must use less than 30 000 gas._

### updateMinter

```solidity
function updateMinter(address minter_, bool status_) external
```

_See {IMOROFT-updateMinter}.

Requirements:
- the caller must be the contract `owner()`._

### mint

```solidity
function mint(address account_, uint256 amount_) public
```

_See {IMOROFT-mint}.

Requirements:
- the caller must be in the list of allowed minters. Check `isMinter`._

### burn

```solidity
function burn(uint256 amount_) public
```

_See {IMOROFT-burn}._

### burnFrom

```solidity
function burnFrom(address account_, uint256 amount_) public
```

_See {IMOROFT-burnFrom, ERC20-_burn, ERC20-allowance}.

Requirements:
- the caller must have allowance for ``accounts``'s tokens of at least
`amount`._

