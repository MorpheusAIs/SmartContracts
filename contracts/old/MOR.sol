// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ERC20, ERC20Capped} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Capped.sol";

import {IMOR, IERC20, IERC165} from "../interfaces/old/IMOR.sol";

contract MOR is IMOR, ERC20Capped, ERC20Burnable, Ownable {
    constructor(uint256 cap_) ERC20("MOR", "MOR") ERC20Capped(cap_) {}

    function supportsInterface(bytes4 interfaceId_) external pure returns (bool) {
        return
            interfaceId_ == type(IMOR).interfaceId ||
            interfaceId_ == type(IERC20).interfaceId ||
            interfaceId_ == type(IERC165).interfaceId;
    }

    function cap() public view override(IMOR, ERC20Capped) returns (uint256) {
        return ERC20Capped.cap();
    }

    function mint(address account_, uint256 amount_) external onlyOwner {
        _mint(account_, amount_);
    }

    function burn(uint256 amount_) public override {
        ERC20Burnable.burn(amount_);
    }

    function _mint(address account_, uint256 amount_) internal override(ERC20, ERC20Capped) {
        ERC20Capped._mint(account_, amount_);
    }
}
