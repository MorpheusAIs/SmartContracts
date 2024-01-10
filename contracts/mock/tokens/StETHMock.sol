// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {PRECISION} from "@solarity/solidity-lib/utils/Globals.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract StETHMock is ERC20, Ownable {
    uint256 public balanceMultiplicator = PRECISION;

    constructor() ERC20("Staked Ether Mock", "stETHMock") {}

    function mint(address account_, uint256 amount_) external {
        require(amount_ <= 1000 * (10 ** decimals()), "StETHMock: amount is too big");

        _mint(account_, amount_);
    }

    function _transfer(address sender_, address recipient_, uint256 amount_) internal override {
        amount_ = (amount_ * PRECISION) / balanceMultiplicator;
        super._transfer(sender_, recipient_, amount_);
    }

    function setBalanceMultiplicator(uint256 balanceMultiplicator_) external onlyOwner {
        balanceMultiplicator = balanceMultiplicator_;
    }

    function balanceOf(address account_) public view override returns (uint256) {
        return (super.balanceOf(account_) * balanceMultiplicator) / PRECISION;
    }
}
