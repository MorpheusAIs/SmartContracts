// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IV3SwapRouter
 * @notice Minimal interface for Uniswap's `SwapRouter02` (`swap-router-contracts` package, not
 * `v3-periphery`'s `ISwapRouter`). Unlike the original `ISwapRouter`, `exactInputSingle` here has
 * no `deadline` field -- `SwapRouter02` expects callers who need deadline protection to wrap the
 * call in its own `multicall(deadline, data[])`, or to enforce it themselves before calling in.
 */
interface IV3SwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    /**
     * @notice Swaps `amountIn` of one token for as much as possible of another token.
     * @param params The parameters necessary for the swap, encoded as `ExactInputSingleParams`.
     * @return amountOut The amount of the received token.
     */
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}
