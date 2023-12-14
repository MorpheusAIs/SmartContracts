// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {TransferHelper} from "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import {ISwapRouter} from "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";

import {INonfungiblePositionManager} from "./interfaces/uniswap-v3/INonfungiblePositionManager.sol";
import {ISwap, IERC165} from "./interfaces/ISwap.sol";
import {IWStETH} from "./interfaces/tokens/IWStETH.sol";

contract Swap is ISwap, ERC165, Ownable {
    address public immutable router;
    address public immutable nonfungiblePositionManager;

    SwapParams public params;

    constructor(address router_, address nonfungiblePositionManager_, SwapParams memory params_) {
        router = router_;
        nonfungiblePositionManager = nonfungiblePositionManager_;

        _editParams(params_);
    }

    function supportsInterface(bytes4 interfaceId_) public view override(ERC165, IERC165) returns (bool) {
        return interfaceId_ == type(ISwap).interfaceId || super.supportsInterface(interfaceId_);
    }

    function editParams(SwapParams memory newParams_) public onlyOwner {
        if (params.tokenIn != newParams_.tokenIn) {
            TransferHelper.safeApprove(params.tokenIn, params.intermediateToken, 0);
        }

        if (params.intermediateToken != newParams_.intermediateToken) {
            TransferHelper.safeApprove(params.intermediateToken, router, 0);
            TransferHelper.safeApprove(params.intermediateToken, nonfungiblePositionManager, 0);
        }

        if (params.tokenOut != newParams_.tokenOut) {
            TransferHelper.safeApprove(params.tokenOut, nonfungiblePositionManager, 0);
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

    function increaseLiquidityCurrentRange(
        uint256 tokenId_,
        uint256 investTokenAmountAdd_,
        uint256 rewardTokenAmountAdd_
    ) external returns (uint128 liquidity, uint256 amount0, uint256 amount1) {
        uint256 amountAdd0_;
        uint256 amountAdd1_;

        (, , address token0, , , , , , , , , ) = INonfungiblePositionManager(nonfungiblePositionManager).positions(
            tokenId_
        );
        if (token0 == params.tokenIn) {
            amountAdd0_ = investTokenAmountAdd_;
            amountAdd1_ = rewardTokenAmountAdd_;
        } else {
            amountAdd0_ = rewardTokenAmountAdd_;
            amountAdd1_ = investTokenAmountAdd_;
        }

        INonfungiblePositionManager.IncreaseLiquidityParams memory params_ = INonfungiblePositionManager
            .IncreaseLiquidityParams({
                tokenId: tokenId_,
                amount0Desired: amountAdd0_,
                amount1Desired: amountAdd1_,
                amount0Min: 0,
                amount1Min: 0,
                deadline: block.timestamp
            });

        (liquidity, amount0, amount1) = INonfungiblePositionManager(nonfungiblePositionManager).increaseLiquidity(
            params_
        );
    }

    function _editParams(SwapParams memory newParams_) internal {
        require(newParams_.tokenIn != address(0), "Swap: invalid tokenIn");
        require(newParams_.tokenOut != address(0), "Swap: invalid tokenOut");
        require(newParams_.intermediateToken != address(0), "Swap: invalid intermediateToken");

        TransferHelper.safeApprove(newParams_.tokenIn, newParams_.intermediateToken, type(uint256).max);

        TransferHelper.safeApprove(newParams_.intermediateToken, router, type(uint256).max);
        TransferHelper.safeApprove(newParams_.intermediateToken, nonfungiblePositionManager, type(uint256).max);

        TransferHelper.safeApprove(newParams_.tokenOut, nonfungiblePositionManager, type(uint256).max);

        params = newParams_;
    }
}
