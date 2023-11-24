// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {IQuoter} from "@uniswap/v3-periphery/contracts/interfaces/IQuoter.sol";
import {ISwapRouter} from "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import {TransferHelper} from "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";

import {ISwap} from "./interfaces/ISwap.sol";

contract Swap is ISwap, Ownable {
    address public immutable router;
    address public immutable quoter;

    SwapParams public params;

    constructor(address router_, address quoter_, SwapParams memory params_) Ownable() {
        router = router_;
        quoter = quoter_;

        editParams(params_);
    }

    function editParams(SwapParams memory newParams_) public onlyOwner {
        if (params.tokenIn != newParams_.tokenIn) {
            if (params.tokenIn != address(0)) {
                TransferHelper.safeApprove(params.tokenIn, router, 0);
            }

            TransferHelper.safeApprove(newParams_.tokenIn, router, type(uint256).max);
        }

        params = newParams_;
    }

    function swap(uint256 amountIn_, uint256 amountOutMin_) external returns (uint256) {
        SwapParams memory params_ = params;

        ISwapRouter.ExactInputSingleParams memory swapParams_ = ISwapRouter.ExactInputSingleParams({
            tokenIn: params_.tokenIn,
            tokenOut: params_.tokenOut,
            fee: params_.fee,
            recipient: msg.sender,
            deadline: block.timestamp,
            amountIn: amountIn_,
            amountOutMinimum: amountOutMin_,
            sqrtPriceLimitX96: params_.sqrtPriceLimitX96
        });

        TransferHelper.safeTransferFrom(swapParams_.tokenIn, msg.sender, address(this), amountIn_);

        return ISwapRouter(router).exactInputSingle(swapParams_);
    }
}
