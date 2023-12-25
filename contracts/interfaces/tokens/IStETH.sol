// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IStETH is IERC20 {
    function transferSharesFrom(address _sender, address _recipient, uint256 _sharesAmount) external returns (uint256);

    function transferShares(address _recipient, uint256 _sharesAmount) external returns (uint256);

    function getPooledEthByShares(uint256 _sharesAmount) external view returns (uint256);

    function getSharesByPooledEth(uint256 _pooledEthAmount) external view returns (uint256);

    function sharesOf(address _account) external view returns (uint256);
}
