// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import {ERC20, ERC20Capped} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Capped.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

import {AddressAliasHelper} from "@arbitrum/nitro-contracts/src/libraries/AddressAliasHelper.sol";

import {IMOR, IERC165, IERC20} from "./interfaces/IMOR.sol";

contract MOR is IMOR, ERC165, ERC20Capped, ERC20Burnable {
    using AddressAliasHelper for address;

    address public owner;

    constructor(address owner_, uint256 cap_) ERC20("MOR", "MOR") ERC20Capped(cap_) {
        owner = owner_.applyL1ToL2Alias();
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC165, IERC165) returns (bool) {
        return
            interfaceId == type(IMOR).interfaceId ||
            interfaceId == type(IERC20).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    function cap() public view override(IMOR, ERC20Capped) returns (uint256) {
        return ERC20Capped.cap();
    }

    function mint(address account_, uint256 amount_) external {
        require(owner == _msgSender(), "MOR: caller is not the owner");

        _mint(account_, amount_);
    }

    function burn(uint256 amount_) public override(IMOR, ERC20Burnable) {
        ERC20Burnable.burn(amount_);
    }

    function _mint(address account_, uint256 amount_) internal override(ERC20, ERC20Capped) {
        ERC20Capped._mint(account_, amount_);
    }
}