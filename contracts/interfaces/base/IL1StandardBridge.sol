// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IL1StandardBridge
 * @notice Minimal interface for the OP Stack `L1StandardBridge` ("Base Bridge"). Base doesn't
 * ship a Solidity package for this (unlike Arbitrum's token-bridge-contracts npm package), so only
 * the one function actually used here is declared.
 */
interface IL1StandardBridge {
    /**
     * @notice Sends ERC20 tokens to a specified account on L2.
     * @param _localToken Address of the ERC20 on L1.
     * @param _remoteToken Address of the corresponding token on L2.
     * @param _to Address of the recipient on L2.
     * @param _amount Amount of local tokens to deposit.
     * @param _minGasLimit Minimum amount of gas that the bridge can be relayed with on L2.
     * @param _extraData Extra data to be sent with the transaction. This data is provided
     *                   solely as a convenience for external contracts. Aside from
     *                   emitting an event, these bytes are not used for anything.
     */
    function bridgeERC20To(
        address _localToken,
        address _remoteToken,
        address _to,
        uint256 _amount,
        uint32 _minGasLimit,
        bytes calldata _extraData
    ) external;
}
