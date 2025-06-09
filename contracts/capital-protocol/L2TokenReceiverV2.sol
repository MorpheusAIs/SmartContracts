// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import {ISwapRouter} from "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import {TransferHelper} from "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";

import {IL2TokenReceiverV2, IERC165, IERC721Receiver} from "../interfaces/capital-protocol/IL2TokenReceiverV2.sol";
import {INonfungiblePositionManager} from "../interfaces/uniswap-v3/INonfungiblePositionManager.sol";

contract L2TokenReceiverV2 is IL2TokenReceiverV2, OwnableUpgradeable, UUPSUpgradeable {
    address public router;
    address public nonfungiblePositionManager;

    SwapParams public secondSwapParams;

    // Storage changes for L2TokenReceiverV2
    SwapParams public firstSwapParams;

    constructor() {
        _disableInitializers();
    }

    function L2TokenReceiver__init(
        address router_,
        address nonfungiblePositionManager_,
        // SwapParams memory firstSwapParams_,
        SwapParams memory secondSwapParams_
    ) external initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();

        router = router_;
        nonfungiblePositionManager = nonfungiblePositionManager_;

        // _addAllowanceUpdateSwapParams(firstSwapParams_, true);
        _addAllowanceUpdateSwapParams(secondSwapParams_, false);
    }

    function supportsInterface(bytes4 interfaceId_) external pure returns (bool) {
        return
            interfaceId_ == type(IL2TokenReceiverV2).interfaceId ||
            interfaceId_ == type(IERC721Receiver).interfaceId ||
            interfaceId_ == type(IERC165).interfaceId;
    }

    function editParams(SwapParams memory newParams_, bool isEditFirstParams_) external onlyOwner {
        SwapParams memory params_ = _getSwapParams(isEditFirstParams_);

        if (params_.tokenIn != address(0) && params_.tokenIn != newParams_.tokenIn) {
            TransferHelper.safeApprove(params_.tokenIn, router, 0);
            TransferHelper.safeApprove(params_.tokenIn, nonfungiblePositionManager, 0);
        }

        if (params_.tokenOut != address(0) && params_.tokenOut != newParams_.tokenOut) {
            TransferHelper.safeApprove(params_.tokenOut, nonfungiblePositionManager, 0);
        }

        _addAllowanceUpdateSwapParams(newParams_, isEditFirstParams_);
    }

    function withdrawToken(address recipient_, address token_, uint256 amount_) external onlyOwner {
        TransferHelper.safeTransfer(token_, recipient_, amount_);
    }

    function withdrawTokenId(address recipient_, address token_, uint256 tokenId_) external onlyOwner {
        IERC721(token_).safeTransferFrom(address(this), recipient_, tokenId_);
    }

    function swap(
        uint256 amountIn_,
        uint256 amountOutMinimum_,
        uint256 deadline_,
        bool isUseFirstSwapParams_
    ) external onlyOwner returns (uint256) {
        SwapParams memory params_ = _getSwapParams(isUseFirstSwapParams_);

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
        uint256 amountAdd0_,
        uint256 amountAdd1_,
        uint256 amountMin0_,
        uint256 amountMin1_
    ) external onlyOwner returns (uint128 liquidity_, uint256 amount0_, uint256 amount1_) {
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

    function version() external pure returns (uint256) {
        return 2;
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }

    function _addAllowanceUpdateSwapParams(SwapParams memory newParams_, bool isEditFirstParams_) private {
        require(newParams_.tokenIn != address(0), "L2TR: invalid tokenIn");
        require(newParams_.tokenOut != address(0), "L2TR: invalid tokenOut");

        TransferHelper.safeApprove(newParams_.tokenIn, router, type(uint256).max);
        TransferHelper.safeApprove(newParams_.tokenIn, nonfungiblePositionManager, type(uint256).max);

        TransferHelper.safeApprove(newParams_.tokenOut, nonfungiblePositionManager, type(uint256).max);

        if (isEditFirstParams_) {
            firstSwapParams = newParams_;
        } else {
            secondSwapParams = newParams_;
        }
    }

    function _getSwapParams(bool isUseFirstSwapParams_) internal view returns (SwapParams memory) {
        return isUseFirstSwapParams_ ? firstSwapParams : secondSwapParams;
    }

    function _authorizeUpgrade(address) internal view override onlyOwner {}
}
