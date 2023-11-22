// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import {IQuoter} from "@uniswap/v3-periphery/contracts/interfaces/IQuoter.sol";
import {ISwapRouter} from "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import {TransferHelper} from "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";

contract Swap {
    struct SwapParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        uint160 sqrtPriceLimitX96;
    }

    address public immutable swapRouter;
    address public immutable quoter;

    SwapParams public params;

    constructor(address swapRouterAddress_, address quoter_, SwapParams memory params_) {
        swapRouter = swapRouterAddress_;
        quoter = quoter_;

        editParams(params_);
    }

    function editParams(SwapParams memory newParams_) public {
        if (params.tokenIn != newParams_.tokenIn) {
            if (params.tokenIn != address(0)) {
                TransferHelper.safeApprove(params.tokenIn, address(swapRouter), 0);
            }

            TransferHelper.safeApprove(newParams_.tokenIn, address(swapRouter), type(uint256).max);
        }

        params = newParams_;
    }

    function getExactInputSingleParams(
        uint256 amountIn_,
        uint256 amountOutMinimum_
    ) public view returns (ISwapRouter.ExactInputSingleParams memory) {
        SwapParams memory params_ = params;

        return
            ISwapRouter.ExactInputSingleParams({
                tokenIn: params_.tokenIn,
                tokenOut: params_.tokenOut,
                fee: params_.fee,
                recipient: msg.sender,
                deadline: block.timestamp,
                amountIn: amountIn_,
                amountOutMinimum: amountOutMinimum_,
                sqrtPriceLimitX96: params_.sqrtPriceLimitX96
            });
    }

    function swapStETHForMor(uint256 amountIn_, uint256 amountOutMin_) external returns (uint256) {
        ISwapRouter.ExactInputSingleParams memory params_ = getExactInputSingleParams(
            amountIn_,
            amountOutMin_
        );

        TransferHelper.safeTransferFrom(params_.tokenIn, msg.sender, address(this), amountIn_);

        return ISwapRouter(swapRouter).exactInputSingle(params_);
    }

    function getEstimatedMorForStETH(uint256 amountIn_) external returns (uint256) {
        SwapParams memory params_ = params;

        return
            IQuoter(quoter).quoteExactInputSingle(
                params_.tokenIn,
                params_.tokenOut,
                params_.fee,
                amountIn_,
                params_.sqrtPriceLimitX96
            );
    }
}
