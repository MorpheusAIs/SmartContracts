// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import {ISwapRouter} from "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract SwapRouterMock {
    function exactInputSingle(
        ISwapRouter.ExactInputSingleParams calldata params_
    ) external returns (uint256) {
        IERC20(params_.tokenIn).transferFrom(msg.sender, address(this), params_.amountIn);
        IERC20(params_.tokenOut).transfer(params_.recipient, params_.amountIn);

        return params_.amountIn;
    }
}