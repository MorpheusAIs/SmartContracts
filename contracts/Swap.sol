// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Swap {
    IERC20 public stEth;
    IUniswapV2Router02 public uniswapRouter;
    address[] public path;

    constructor(address uniswapRouterAddress_, address stEthAddress_, address targetTokenAddress_) {
        uniswapRouter = IUniswapV2Router02(uniswapRouterAddress_);

        // TODO: Should we use WETH in the path?
        path = new address[](2);
        path[0] = stEthAddress_;
        path[1] = targetTokenAddress_;

        stEth = IERC20(stEthAddress_);

        IERC20(stEthAddress_).approve(uniswapRouterAddress_, type(uint256).max);
    }

    function swapStETHToMor(uint256 amountIn_, uint256 amountOutMin_) external returns (uint256) {
        stEth.transferFrom(msg.sender, address(this), amountIn_);

        uint256[] memory amounts = uniswapRouter.swapExactTokensForTokens(
            amountIn_,
            amountOutMin_,
            path,
            msg.sender,
            block.timestamp
        );

        return amounts[1];
    }
}
