// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "wormhole-solidity-sdk/WormholeRelayerSDK.sol";

import {IMOROFT, IERC20} from "./interfaces/IMOROFT.sol";

/**
 * Contract that provides the ability to bridge MOR tokens by burning them on a source chain
 * and minting the corresponding amount of tokens on a target chain via Wormhole
 */
contract MORWormhole is TokenSender, TokenReceiver {
    uint256 public constant GAS_LIMIT = 250_000;

    constructor(
        address wormholeRelayer_,
        address tokenBridge_,
        address wormhole_
    ) TokenBase(wormholeRelayer_, tokenBridge_, wormhole_) {}

    /**
     * @notice The function to retrieve the cost of a cross-chain deposit request
     * @dev The cost depends on the gas amount, receiver value, and message fee
     * @param targetChain_ a chain the cost of the deposit to which is requested.
     * @return the cost of a cross-chain deposit request
     */
    function quoteCrossChainDeposit(uint16 targetChain_) public view returns (uint256) {
        uint256 deliveryCost_;
        (deliveryCost_, ) = wormholeRelayer.quoteEVMDeliveryPrice(targetChain_, 0, GAS_LIMIT);

        return deliveryCost_ + wormhole.messageFee();
    }

    /**
     * @notice The function to send some amount of a tokens to a specific recipient on a target chain.
     *
     * Tokens are burnt on a source chain in order to be minted on a target chain.
     *
     * Function has to be called with the value previously retrieved from quoteCrossChainDeposit
     * to cover the relaying cost
     *
     * @param targetChain_ a chain to which tokens are bridged.
     * @param targetToken_ address of a token which will be minted on the target chain.
     * @param recipient_ address to mint tokens on the target chain to.
     * @param amount_ amount of tokens which will be minted to the recipient on the target chain.
     * @param token_ address of a token which will be burnt on the source chain.
     */
    function sendCrossChainDeposit(
        uint16 targetChain_,
        address targetToken_,
        address recipient_,
        uint256 amount_,
        address token_
    ) external payable {
        require(
            msg.value == quoteCrossChainDeposit(targetChain_),
            "MORWormhole: msg.value must be quoteCrossChainDeposit(targetChain)"
        );

        IERC20(token_).transferFrom(msg.sender, address(this), amount_);
        IMOROFT(token_).burn(amount_);

        bytes memory payload_ = abi.encode(recipient_);
        sendTokenWithPayloadToEvm(targetChain_, targetToken_, payload_, 0, GAS_LIMIT, token_, amount_);
    }

    /**
     * @notice The function to receive some amount of a tokens from a source chain on a target chain.
     *
     * Tokens are minted on a target chain after being burnt on a source chain.
     *
     * @param payload_ is an encoded recipient address.
     * @param receivedTokens_ an array of length 1 containing a struct with token transfer details.
     */
    function receivePayloadAndTokens(
        bytes memory payload_,
        TokenReceived[] memory receivedTokens_,
        bytes32,
        uint16,
        bytes32
    ) internal override onlyWormholeRelayer {
        require(receivedTokens_.length == 1, "MORWormhole: Expected 1 token transfers");

        address recipient_ = abi.decode(payload_, (address));

        IMOROFT(receivedTokens_[0].tokenAddress).mint(recipient_, receivedTokens_[0].amount);
    }
}
