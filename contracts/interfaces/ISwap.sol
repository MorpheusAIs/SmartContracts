// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

interface ISwap {
    struct SwapParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        uint160 sqrtPriceLimitX96;
    }
}
