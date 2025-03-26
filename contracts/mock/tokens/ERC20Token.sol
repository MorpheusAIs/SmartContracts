// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20, ERC20Capped} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Capped.sol";

contract ERC20Token is ERC20, ERC20Capped {
    uint8 decimalsValue;

    constructor() ERC20("token_name", "token_symbol") ERC20Capped(5_000_000_000 ether) {
        decimalsValue = 18;
    }

    function mint(address account_, uint256 amount_) external {
        _mint(account_, amount_);
    }

    function deposit() external payable {
        _mint(msg.sender, msg.value);
    }

    function _mint(address account_, uint256 amount_) internal override(ERC20, ERC20Capped) {
        ERC20Capped._mint(account_, amount_);
    }

    function setDecimals(uint8 value_) public {
        decimalsValue = value_;
    }

    function decimals() public view override returns (uint8) {
        return decimalsValue;
    }
}
