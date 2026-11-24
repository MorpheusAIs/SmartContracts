// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.20;

interface IBridgeableTokens {
    function l1Token() external returns (address);
    function l2Token() external returns (address);
}
