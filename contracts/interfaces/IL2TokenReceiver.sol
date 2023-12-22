// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

/**
 * This is Swap contract that swaps tokens using Uniswap V3.
 */
interface IL2TokenReceiver is IERC165 {
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
     * The function to edit the swap params.
     * @param params_ The new swap params.
     */
    function editParams(SwapParams memory params_) external;

    /**
     * The function to swap tokens.
     * @dev Firstly the tokens are wrapped to the intermediate token and then swapped via Uniswap V3.
     * @param amountIn_ The amount of tokens to swap.
     * @param amountOutMinimum_ The minimum amount of tokens to receive.
     * @return The amount of tokens received.
     */
    function swap(uint256 amountIn_, uint256 amountOutMinimum_) external returns (uint256);

    /**
     * The function to increase liquidity in the current price range.
     * @param tokenId The ID of the position.
     * @param amountAdd0_ The amount of tokenIn to add.
     * @param amountAdd1_ The amount of tokenOut to add.
     * @return liquidity The amount of liquidity added.
     * @return amount0 The amount of token0 added.
     * @return amount1 The amount of token1 added.
     */
    function increaseLiquidityCurrentRange(
        uint256 tokenId,
        uint256 amountAdd0_,
        uint256 amountAdd1_
    ) external returns (uint128 liquidity, uint256 amount0, uint256 amount1);

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
