// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ILayerZeroReceiver} from "@layerzerolabs/lz-evm-sdk-v1-0.7/contracts/interfaces/ILayerZeroReceiver.sol";

interface IL2MessageReceiver is ILayerZeroReceiver {
    /**
     * The event that is emitted when the message is received.
     * @param senderChainId The source endpoint identifier.
     * @param senderAndReceiverAddresses The source sending contract address from the source chain.
     * @param nonce The ordered message nonce.
     * @param payload The signed payload is the UA bytes has encoded to be sent.
     */
    event MessageSuccess(uint16 senderChainId, bytes senderAndReceiverAddresses, uint64 nonce, bytes payload);

    /**
     * The event that is emitted when the message is failed.
     * @param senderChainId The source endpoint identifier.
     * @param senderAndReceiverAddresses The source sending contract address from the source chain.
     * @param nonce The ordered message nonce.
     * @param payload The signed payload is the UA bytes has encoded to be sent.
     * @param reason The reason of failure.
     */
    event MessageFailed(
        uint16 senderChainId,
        bytes senderAndReceiverAddresses,
        uint64 nonce,
        bytes payload,
        bytes reason
    );

    /**
     * The event that is emitted when the message is retried.
     * @param senderChainId The source endpoint identifier.
     * @param senderAndReceiverAddresses The source sending contract address from the source chain.
     * @param nonce The ordered message nonce.
     * @param payload The signed payload is the UA bytes has encoded to be sent.
     */
    event RetryMessageSuccess(uint16 senderChainId, bytes senderAndReceiverAddresses, uint64 nonce, bytes payload);

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

    /**
     * The function to call the nonblockingLzReceive.
     * @param senderChainId_ The source endpoint identifier.
     * @param senderAndReceiverAddresses_ The source sending contract address from the source chain.
     * @param payload_ The signed payload is the UA bytes has encoded to be sent.
     */
    function nonblockingLzReceive(
        uint16 senderChainId_,
        bytes memory senderAndReceiverAddresses_,
        bytes memory payload_
    ) external;

    /**
     * Retry to execute the blocked message.
     * @param senderChainId_ The source endpoint identifier.
     * @param senderAndReceiverAddresses_ The source sending contract address from the source chain.
     * @param nonce_ The ordered message nonce.
     * @param payload_ The signed payload is the UA bytes has encoded to be sent.
     */
    function retryMessage(
        uint16 senderChainId_,
        bytes memory senderAndReceiverAddresses_,
        uint64 nonce_,
        bytes memory payload_
    ) external;
}
