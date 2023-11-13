// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import {ERC20, ERC20Capped} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Capped.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

contract MOR is ERC20Capped, ERC20Burnable {
    address public owner;

    constructor(address owner_, uint256 cap_) ERC20("MOR", "MOR") ERC20Capped(cap_) {
        owner = owner_;
    }

    function mint(address account_, uint256 amount_) external {
        require(owner == _msgSender(), "MOR: caller is not the owner");

        _mint(account_, amount_);
    }

    function _mint(address account_, uint256 amount_) internal override(ERC20, ERC20Capped) {
        ERC20Capped._mint(account_, amount_);
    }
}
