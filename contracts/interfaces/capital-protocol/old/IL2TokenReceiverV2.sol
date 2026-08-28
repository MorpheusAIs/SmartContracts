// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

/**
 * This is Swap contract that swaps tokens using Uniswap V3.
 */
interface IL2TokenReceiverV2 is IERC165, IERC721Receiver {
    /**
     * The structure that stores the swap params.
     * @param tokenIn The address of the token to swap from.
     * @param tokenOut The address of the token to swap to.
     * @param fee The fee of the swap.
     * @param sqrtPriceLimitX96 The price limit of the swap.
     */
    struct SwapParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        uint160 sqrtPriceLimitX96;
    }

    /**
     * The event that is emitted when the swap is executed.
     * @param tokenIn The address of the token to swap from.
     * @param tokenOut The address of the token to swap to.
     * @param amountIn The amount of tokens to swap.
     * @param amountOut The amount of tokens received.
     * @param amountOutMinimum The minimum amount of tokens to receive.
     */
    event TokensSwapped(
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 amountOutMinimum
    );

    /**
     * The event that is emitted when the liquidity is increased.
     * @param tokenId The ID of the position.
     * @param amount0 The amount of token0 added.
     * @param amount1 The amount of token1 added.
     * @param liquidity The amount of liquidity added.
     * @param amount0Min The minimum amount of token0 to add.
     * @param amount1Min The minimum amount of token1 to add.
     */
    event LiquidityIncreased(
        uint256 indexed tokenId,
        uint256 amount0,
        uint256 amount1,
        uint256 liquidity,
        uint256 amount0Min,
        uint256 amount1Min
    );

    /**
     * The event that is emitted when the fees are collected.
     * @param tokenId The ID of the position.
     * @param amount0 The amount of token0 collected.
     * @param amount1 The amount of token1 collected.
     */
    event FeesCollected(uint256 indexed tokenId, uint256 amount0, uint256 amount1);

    /**
     * The function to edit the swap params.
     * @param params_ The new swap params.
     * @param isEditFirstParams_ The flag to indicate if the swapParams is initial.
     */
    function editParams(SwapParams memory params_, bool isEditFirstParams_) external;

    /**
     * The function to swap current contract's tokens specified in the params.
     * @param amountIn_ The amount of tokens to swap.
     * @param amountOutMinimum_ The minimum amount of tokens to receive.
     * @param deadline_ The deadline for the swap.
     * @param isUseFirstSwapParams_ The flag to indicate if the swapParams is initial.
     * @return The amount of tokens received.
     */
    function swap(
        uint256 amountIn_,
        uint256 amountOutMinimum_,
        uint256 deadline_,
        bool isUseFirstSwapParams_
    ) external returns (uint256);

    /**
     * The function to withdraw tokens from the contract.
     * @param recipient_ The address of the recipient.
     * @param token_ The address of the token to withdraw.
     * @param amount_ The amount of tokens to withdraw.
     */
    function withdrawToken(address recipient_, address token_, uint256 amount_) external;

    /**
     * The function to withdraw NFT token from the contract.
     * @param recipient_ The address of the recipient.
     * @param token_ The address of the token to withdraw.
     * @param tokenId_ The ID of the token to withdraw.
     */
    function withdrawTokenId(address recipient_, address token_, uint256 tokenId_) external;

    /**
     * The function to increase liquidity in the current price range.
     * @param tokenId The ID of the position.
     * @param amountAdd0_ The amount of token0 to add.
     * @param amountAdd1_ The amount of token1 to add.
     * @param amountMin0_ The minimum amount of token0 to add.
     * @param amountMin1_ The minimum amount of token1 to add.
     * @return liquidity_ The amount of liquidity added.
     * @return amount0_ The amount of token0 added.
     * @return amount1_ The amount of token1 added.
     */
    function increaseLiquidityCurrentRange(
        uint256 tokenId,
        uint256 amountAdd0_,
        uint256 amountAdd1_,
        uint256 amountMin0_,
        uint256 amountMin1_
    ) external returns (uint128 liquidity_, uint256 amount0_, uint256 amount1_);

    /**
     * The function to collect fees from the position. The fees are not transferred to the caller.
     * @param tokenId_ The ID of the position.
     * @return amount0_ The amount of token0 collected.
     * @return amount1_ The amount of token1 collected.
     */
    function collectFees(uint256 tokenId_) external returns (uint256 amount0_, uint256 amount1_);

    /**
     * The function to get the router address.
     * @return The address of the router.
     */
    function router() external view returns (address);

    /**
     * The function to get the nonfungible position manager address.
     * @return The address of the nonfungible position manager.
     */
    function nonfungiblePositionManager() external view returns (address);
}
