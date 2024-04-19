// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {OFT} from "./@layerzerolabs/lz-evm-oapp-v2/contracts/oft/OFT.sol";

import {IMOROFT, IERC20, IERC165, IOAppCore} from "./interfaces/IMOROFT.sol";

/**
 * This is the interface for MOROFT token contract. The token is ERC20 with burnable and Layer Zero OFT features.
 */
contract MOROFT is IMOROFT, OFT {
    address private immutable _minter;

    constructor(
        address layerZeroEndpoint_,
        address delegate_,
        address minter_
    ) OFT("MOR", "MOR", layerZeroEndpoint_, delegate_) {
        require(minter_ != address(0), "MOROFT: invalid minter");

        _minter = minter_;

        transferOwnership(delegate_);
    }

    /**
     * @dev Returns true if this contract implements the interface defined by
     * `interfaceId`. See the corresponding
     * https://eips.ethereum.org/EIPS/eip-165#how-interfaces-are-identified[EIP section]
     * to learn more about how these ids are created.
     *
     * This function call must use less than 30 000 gas.
     */
    function supportsInterface(bytes4 interfaceId_) external pure returns (bool) {
        return
            interfaceId_ == type(IMOROFT).interfaceId ||
            interfaceId_ == type(IERC20).interfaceId ||
            interfaceId_ == type(IOAppCore).interfaceId ||
            interfaceId_ == type(IERC165).interfaceId;
    }

    /**
     * @notice The function to get the minter address.
     * @return The minter address.
     */
    function minter() public view returns (address) {
        return _minter;
    }

    /**
     * @notice The function to mint tokens.
     * @param account_ The address of the account to mint tokens to.
     * @param amount_ The amount of tokens to mint.
     */
    function mint(address account_, uint256 amount_) public {
        require(_msgSender() == minter(), "MOROFT: invalid caller");

        _mint(account_, amount_);
    }

    /**
     * @notice The function to destroys `amount` tokens from the caller.
     * See {ERC20-_burn}.
     * @param amount_ The amount of tokens to burn.
     */
    function burn(uint256 amount_) public {
        _burn(_msgSender(), amount_);
    }

    /**
     * @notice The function to destroys `amount` tokens from `account`, deducting from the caller's
     * allowance.
     *
     * See {ERC20-_burn} and {ERC20-allowance}.
     *
     * Requirements:
     *
     * - the caller must have allowance for ``accounts``'s tokens of at least
     * `amount`.
     *
     * @param account_ The address of the account to burn tokens from.
     * @param amount_ The amount of tokens to burn.
     */
    function burnFrom(address account_, uint256 amount_) public {
        _spendAllowance(account_, _msgSender(), amount_);
        _burn(account_, amount_);
    }
}
