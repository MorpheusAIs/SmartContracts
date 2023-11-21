// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

contract QuoterMock {
    function quoteExactInputSingle(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountIn,
        uint160 sqrtPriceLimitX96
    ) external pure returns (uint256 amountOut) {
        return amountIn;
    }
}
