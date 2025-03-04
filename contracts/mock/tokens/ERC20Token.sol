// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20, ERC20Capped} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Capped.sol";

contract ERC20Token is ERC20 {
    constructor() ERC20("token_name", "token_symbol") {}

    function mint(address account_, uint256 amount_) external {
        _mint(account_, amount_);
    }
}
