// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import {ISwapRouter} from "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import {TransferHelper} from "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";

import {IL2TokenReceiver, IERC165, IERC721Receiver} from "../../interfaces/capital-protocol/old/IL2TokenReceiver.sol";
import {INonfungiblePositionManager} from "../../interfaces/uniswap-v3/INonfungiblePositionManager.sol";

contract L2TokenReceiver is IL2TokenReceiver, OwnableUpgradeable, UUPSUpgradeable {
    address public router;
    address public nonfungiblePositionManager;

    SwapParams public params;

    constructor() {
        _disableInitializers();
    }

    function L2TokenReceiver__init(
        address router_,
        address nonfungiblePositionManager_,
        SwapParams memory params_
    ) external initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();

        router = router_;
        nonfungiblePositionManager = nonfungiblePositionManager_;

        _editParams(params_);
    }

    function supportsInterface(bytes4 interfaceId_) external pure returns (bool) {
        return
            interfaceId_ == type(IL2TokenReceiver).interfaceId ||
            interfaceId_ == type(IERC721Receiver).interfaceId ||
            interfaceId_ == type(IERC165).interfaceId;
    }

    function editParams(SwapParams memory newParams_) external onlyOwner {
        if (params.tokenIn != newParams_.tokenIn) {
            TransferHelper.safeApprove(params.tokenIn, router, 0);
            TransferHelper.safeApprove(params.tokenIn, nonfungiblePositionManager, 0);
        }

        if (params.tokenOut != newParams_.tokenOut) {
            TransferHelper.safeApprove(params.tokenOut, nonfungiblePositionManager, 0);
        }

        _editParams(newParams_);
    }

    function swap(
        uint256 amountIn_,
        uint256 amountOutMinimum_,
        uint256 deadline_
    ) external onlyOwner returns (uint256) {
        SwapParams memory params_ = params;

        ISwapRouter.ExactInputSingleParams memory swapParams_ = ISwapRouter.ExactInputSingleParams({
            tokenIn: params_.tokenIn,
            tokenOut: params_.tokenOut,
            fee: params_.fee,
            recipient: address(this),
            deadline: deadline_,
            amountIn: amountIn_,
            amountOutMinimum: amountOutMinimum_,
            sqrtPriceLimitX96: params_.sqrtPriceLimitX96
        });

        uint256 amountOut_ = ISwapRouter(router).exactInputSingle(swapParams_);

        emit TokensSwapped(params_.tokenIn, params_.tokenOut, amountIn_, amountOut_, amountOutMinimum_);

        return amountOut_;
    }

    function increaseLiquidityCurrentRange(
        uint256 tokenId_,
        uint256 depositTokenAmountAdd_,
        uint256 rewardTokenAmountAdd_,
        uint256 depositTokenAmountMin_,
        uint256 rewardTokenAmountMin_
    ) external onlyOwner returns (uint128 liquidity_, uint256 amount0_, uint256 amount1_) {
        uint256 amountAdd0_;
        uint256 amountAdd1_;
        uint256 amountMin0_;
        uint256 amountMin1_;

        (, , address token0_, , , , , , , , , ) = INonfungiblePositionManager(nonfungiblePositionManager).positions(
            tokenId_
        );
        if (token0_ == params.tokenIn) {
            amountAdd0_ = depositTokenAmountAdd_;
            amountAdd1_ = rewardTokenAmountAdd_;
            amountMin0_ = depositTokenAmountMin_;
            amountMin1_ = rewardTokenAmountMin_;
        } else {
            amountAdd0_ = rewardTokenAmountAdd_;
            amountAdd1_ = depositTokenAmountAdd_;
            amountMin0_ = rewardTokenAmountMin_;
            amountMin1_ = depositTokenAmountMin_;
        }

        INonfungiblePositionManager.IncreaseLiquidityParams memory params_ = INonfungiblePositionManager
            .IncreaseLiquidityParams({
                tokenId: tokenId_,
                amount0Desired: amountAdd0_,
                amount1Desired: amountAdd1_,
                amount0Min: amountMin0_,
                amount1Min: amountMin1_,
                deadline: block.timestamp
            });

        (liquidity_, amount0_, amount1_) = INonfungiblePositionManager(nonfungiblePositionManager).increaseLiquidity(
            params_
        );

        emit LiquidityIncreased(tokenId_, amount0_, amount1_, liquidity_, amountMin0_, amountMin1_);
    }

    function collectFees(uint256 tokenId_) external returns (uint256 amount0_, uint256 amount1_) {
        INonfungiblePositionManager.CollectParams memory params_ = INonfungiblePositionManager.CollectParams({
            tokenId: tokenId_,
            recipient: address(this),
            amount0Max: type(uint128).max,
            amount1Max: type(uint128).max
        });

        (amount0_, amount1_) = INonfungiblePositionManager(nonfungiblePositionManager).collect(params_);

        emit FeesCollected(tokenId_, amount0_, amount1_);
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }

    function _editParams(SwapParams memory newParams_) private {
        require(newParams_.tokenIn != address(0), "L2TR: invalid tokenIn");
        require(newParams_.tokenOut != address(0), "L2TR: invalid tokenOut");

        TransferHelper.safeApprove(newParams_.tokenIn, router, type(uint256).max);
        TransferHelper.safeApprove(newParams_.tokenIn, nonfungiblePositionManager, type(uint256).max);

        TransferHelper.safeApprove(newParams_.tokenOut, nonfungiblePositionManager, type(uint256).max);

        params = newParams_;
    }

    function _authorizeUpgrade(address) internal view override onlyOwner {}
}
