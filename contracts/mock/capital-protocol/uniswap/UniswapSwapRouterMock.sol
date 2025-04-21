// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ISwapRouter} from "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import {TransferHelper} from "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import {IUniswapV3Factory} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import {IUniswapV3Pool} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";

import {IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "hardhat/console.sol";

contract UniswapSwapRouterMock {
    address public uniswapSwapRouter;

    function exactInputSingle(ISwapRouter.ExactInputSingleParams calldata params_) external returns (uint256) {
        IERC20(params_.tokenIn).transferFrom(msg.sender, address(this), params_.amountIn);
        IERC20(params_.tokenOut).transfer(params_.recipient, params_.amountIn);

        return params_.amountIn;
    }

    function exactInput(ISwapRouter.ExactInputParams calldata params_) external returns (uint256) {
        address tokenIn_;
        address tokenOut_;

        bytes memory path_ = params_.path;
        uint256 pathLength = params_.path.length;

        assembly {
            tokenIn_ := mload(add(path_, 20))
            tokenOut_ := mload(add(add(path_, sub(pathLength, 20)), 20))
        }

        IERC20(tokenIn_).transferFrom(msg.sender, address(this), params_.amountIn);
        IERC20(tokenOut_).transfer(params_.recipient, params_.amountIn);

        return params_.amountIn;
    }

    function setUniswapSwapRouter(address value_) external {
        uniswapSwapRouter = value_;
    }

    function swapExactInputSingle(
        address tokenIn_,
        address tokenOut_,
        uint256 amountIn_,
        uint256 amountOutMinimum_,
        uint24 poolFee_,
        address recipient_
    ) external returns (uint256) {
        TransferHelper.safeApprove(tokenIn_, uniswapSwapRouter, amountIn_);

        ISwapRouter.ExactInputSingleParams memory params_ = ISwapRouter.ExactInputSingleParams({
            tokenIn: tokenIn_,
            tokenOut: tokenOut_,
            fee: poolFee_,
            recipient: recipient_,
            deadline: block.timestamp,
            amountIn: amountIn_,
            amountOutMinimum: amountOutMinimum_,
            sqrtPriceLimitX96: 0
        });

        uint256 amountOut_ = ISwapRouter(uniswapSwapRouter).exactInputSingle(params_);

        return amountOut_;
    }
}
