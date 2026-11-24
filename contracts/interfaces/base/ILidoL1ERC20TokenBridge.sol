// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ILidoL1ERC20TokenBridge
 * @notice Minimal interface for Lido's own Base L1 ERC20 token bridge. NOT the generic OP Stack
 * `L1StandardBridge` -- Base's bridged wstETH is only mintable by Lido's own bridge.
 * https://docs.lido.fi/deployed-contracts/ (Base section)
 */
interface ILidoL1ERC20TokenBridge {
    function depositERC20To(
        address l1Token_,
        address l2Token_,
        address to_,
        uint256 amount_,
        uint32 l2Gas_,
        bytes calldata data_
    ) external;
}
