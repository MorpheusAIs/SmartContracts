// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {IStETH} from "../../interfaces/tokens/IStETH.sol";

contract WStETHMock is ERC20 {
    IStETH public stETH;

    constructor(address stETH_) ERC20("Wraped Staked Ether Mock", "WStETHMock") {
        stETH = IStETH(stETH_);
    }

    function mint(address account_, uint256 amount_) external {
        _mint(account_, amount_);
    }

    /*
     * @dev Wrap 1 stETH to 1 wstETH
     */
    function wrap(uint256 stETHAmount_) external returns (uint256) {
        require(stETHAmount_ > 0, "wstETH: can't wrap zero stETH");
        _mint(msg.sender, stETHAmount_);
        stETH.transferFrom(msg.sender, address(this), stETHAmount_);
        return stETHAmount_;
    }
}
