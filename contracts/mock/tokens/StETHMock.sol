// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {PRECISION} from "@solarity/solidity-lib/utils/Globals.sol";

import {IStETH} from "../../interfaces/tokens/IStETH.sol";

contract StETHMock is ERC20 {
    uint256 public totalPooledEther = PRECISION;

    constructor() ERC20("Staked Ether", "stETH") {}

    function mint(address account_, uint256 amount_) external {
        _mint(account_, amount_);
    }

    function _transfer(address sender_, address recipient_, uint256 amount_) internal override {
        amount_ = (amount_ * PRECISION) / totalPooledEther;
        super._transfer(sender_, recipient_, amount_);
    }

    function setTotalPooledEther(uint256 totalPooledEther_) external {
        totalPooledEther = totalPooledEther_;
    }

    function balanceOf(address account_) public view override returns (uint256) {
        return (super.balanceOf(account_) * totalPooledEther) / PRECISION;
    }
}
