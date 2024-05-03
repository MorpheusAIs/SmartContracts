// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {OFT} from "./@layerzerolabs/lz-evm-oapp-v2/contracts/oft/OFT.sol";

import {IMOROFT, IERC20, IERC165, IOAppCore} from "./interfaces/IMOROFT.sol";

/**
 * The token is ERC20 with burnable and Layer Zero OFT features.
 * @custom:security-contact devs@mor.org
 */
contract MOROFT is IMOROFT, OFT {
    mapping(address => bool) public isMinter;

    constructor(
        address layerZeroEndpoint_,
        address delegate_,
        address minter_
    ) OFT("MOR", "MOR", layerZeroEndpoint_, delegate_) {
        require(minter_ != address(0), "MOROFT: invalid minter");

        isMinter[minter_] = true;

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
     * @dev See {IMOROFT-updateMinter}.
     *
     * Requirements:
     * - the caller must be the contract `owner()`.
     *
     */
    function updateMinter(address minter_, bool status_) external onlyOwner {
        isMinter[minter_] = status_;
    }

    /**
     * @dev See {IMOROFT-mint}.
     *
     * Requirements:
     * - the caller must be in the list of allowed minters. Check `isMinter`.
     *
     */
    function mint(address account_, uint256 amount_) public {
        require(isMinter[_msgSender()], "MOROFT: invalid caller");

        _mint(account_, amount_);
    }

    /**
     * @dev See {IMOROFT-burn}.
     */
    function burn(uint256 amount_) public {
        _burn(_msgSender(), amount_);
    }

    /**
     * @dev See {IMOROFT-burnFrom, ERC20-_burn, ERC20-allowance}.
     *
     * Requirements:
     * - the caller must have allowance for ``accounts``'s tokens of at least
     * `amount`.
     */
    function burnFrom(address account_, uint256 amount_) public {
        _spendAllowance(account_, _msgSender(), amount_);
        _burn(account_, amount_);
    }
}
