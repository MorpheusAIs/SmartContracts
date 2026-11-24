// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IV3SwapRouter} from "../../../interfaces/uniswap-v3/IV3SwapRouter.sol";

contract UniswapV3SwapRouter02Mock {
    function exactInputSingle(IV3SwapRouter.ExactInputSingleParams calldata params_) external returns (uint256) {
        IERC20(params_.tokenIn).transferFrom(msg.sender, address(this), params_.amountIn);
        IERC20(params_.tokenOut).transfer(params_.recipient, params_.amountIn);

        return params_.amountIn;
    }
}
