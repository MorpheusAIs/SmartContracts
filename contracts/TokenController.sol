// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ISwap} from "./interfaces/ISwap.sol";
import {IMOR} from "./interfaces/IMOR.sol";

contract TokenController {
    address public investToken;
    address public rewardToken;
    address public swap;

    constructor(address investToken_, address rewardToken_, address swap_) {
        investToken = investToken_;
        rewardToken = rewardToken_;
        swap = swap_;

        IERC20(investToken_).approve(swap, type(uint256).max);
    }

    function swapAndAddLiquidity(uint256 amountIn_, uint256 amountOutMinimum_, uint256 tokenId_) external {
        ISwap(swap).swap(amountIn_, amountOutMinimum_);

        ISwap(swap).increaseLiquidityCurrentRange(
            tokenId_,
            IERC20(investToken).balanceOf(address(this)),
            IERC20(rewardToken).balanceOf(address(this))
        );
    }

    function mintRewardToUser(address user_, uint256 amount_) external {
        IMOR(rewardToken).mint(user_, amount_);
    }
}
