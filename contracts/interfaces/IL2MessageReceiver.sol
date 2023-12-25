// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

interface IL2MessageReceiver {
    /**
     * The structure that stores the config data.
     * @param gateway The address of token's gateway.
     * @param sender The address of sender (L1Sender).
     * @param senderChainId The chain id of sender (L1).
     */
    struct Config {
        address gateway;
        address sender;
        uint16 senderChainId;
    }

    /**
     * The function to get the nonce of obtained messages.
     * @return The nonce.
     */
    function nonce() external view returns (uint64);

    /**
     * The function to get the reward token's address.
     * @return The address of reward token.
     */
    function rewardToken() external view returns (address);

    /**
     * The function to set the params.
     * @param rewardToken_ The address of reward token.
     * @param config_ The config data.
     */
    function setParams(address rewardToken_, Config calldata config_) external;
}
