// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {TransferHelper} from "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import {ISwapRouter} from "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";

import {ISwap, IERC165} from "./interfaces/ISwap.sol";
import {IWStETH} from "./interfaces/tokens/IWStETH.sol";

contract Swap is ISwap, ERC165, Ownable {
    address public immutable override router;

    SwapParams public params;

    constructor(address router_, SwapParams memory params_) {
        router = router_;

        _editParams(params_);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC165, IERC165) returns (bool) {
        return interfaceId == type(ISwap).interfaceId || super.supportsInterface(interfaceId);
    }

    function editParams(SwapParams memory newParams_) public onlyOwner {
        if (params.tokenIn != newParams_.tokenIn) {
            TransferHelper.safeApprove(params.tokenIn, params.intermediateToken, 0);
        }

        if (params.intermediateToken != newParams_.intermediateToken) {
            TransferHelper.safeApprove(params.intermediateToken, router, 0);
        }

        _editParams(newParams_);
    }

    function swap(uint256 amountIn_, uint256 amountOutMinimum_) external returns (uint256) {
        SwapParams memory params_ = params;

        TransferHelper.safeTransferFrom(params_.tokenIn, _msgSender(), address(this), amountIn_);

        uint256 wrapedAmountIn_ = IWStETH(params_.intermediateToken).wrap(amountIn_);

        ISwapRouter.ExactInputSingleParams memory swapParams_ = ISwapRouter.ExactInputSingleParams({
            tokenIn: params_.intermediateToken,
            tokenOut: params_.tokenOut,
            fee: params_.fee,
            recipient: _msgSender(),
            deadline: block.timestamp,
            amountIn: wrapedAmountIn_,
            amountOutMinimum: amountOutMinimum_,
            sqrtPriceLimitX96: params_.sqrtPriceLimitX96
        });

        return ISwapRouter(router).exactInputSingle(swapParams_);
    }

    function _editParams(SwapParams memory newParams_) internal {
        require(newParams_.tokenIn != address(0), "Swap: invalid tokenIn");
        require(newParams_.tokenOut != address(0), "Swap: invalid tokenOut");
        require(newParams_.intermediateToken != address(0), "Swap: invalid intermediateToken");

        TransferHelper.safeApprove(newParams_.tokenIn, newParams_.intermediateToken, type(uint256).max);

        TransferHelper.safeApprove(newParams_.intermediateToken, router, type(uint256).max);

        params = newParams_;
    }
}
