// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import {IMOROFT} from "../../interfaces/IMOROFT.sol";
import {IL2MessageReceiver} from "../../interfaces/capital-protocol/old/IL2MessageReceiver.sol";

contract L2MessageReceiver is IL2MessageReceiver, OwnableUpgradeable, UUPSUpgradeable {
    address public rewardToken;

    Config public config;

    mapping(uint16 => mapping(bytes => mapping(uint64 => bytes32))) public failedMessages;

    constructor() {
        _disableInitializers();
    }

    function L2MessageReceiver__init() external initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();
    }

    function setParams(address rewardToken_, Config calldata config_) external onlyOwner {
        rewardToken = rewardToken_;
        config = config_;
    }

    function lzReceive(
        uint16 senderChainId_,
        bytes memory senderAndReceiverAddresses_,
        uint64 nonce_,
        bytes memory payload_
    ) external {
        require(_msgSender() == config.gateway, "L2MR: invalid gateway");

        _blockingLzReceive(senderChainId_, senderAndReceiverAddresses_, nonce_, payload_);
    }

    function nonblockingLzReceive(
        uint16 senderChainId_,
        bytes memory senderAndReceiverAddresses_,
        bytes memory payload_
    ) public {
        require(_msgSender() == address(this), "L2MR: invalid caller");

        _nonblockingLzReceive(senderChainId_, senderAndReceiverAddresses_, payload_);
    }

    function retryMessage(
        uint16 senderChainId_,
        bytes memory senderAndReceiverAddresses_,
        uint64 nonce_,
        bytes memory payload_
    ) external {
        bytes32 payloadHash_ = failedMessages[senderChainId_][senderAndReceiverAddresses_][nonce_];
        require(payloadHash_ != bytes32(0), "L2MR: no stored message");
        require(keccak256(payload_) == payloadHash_, "L2MR: invalid payload");

        _nonblockingLzReceive(senderChainId_, senderAndReceiverAddresses_, payload_);

        delete failedMessages[senderChainId_][senderAndReceiverAddresses_][nonce_];

        emit RetryMessageSuccess(senderChainId_, senderAndReceiverAddresses_, nonce_, payload_);
    }

    function _blockingLzReceive(
        uint16 senderChainId_,
        bytes memory senderAndReceiverAddresses_,
        uint64 nonce_,
        bytes memory payload_
    ) private {
        try
            IL2MessageReceiver(address(this)).nonblockingLzReceive(
                senderChainId_,
                senderAndReceiverAddresses_,
                payload_
            )
        {
            emit MessageSuccess(senderChainId_, senderAndReceiverAddresses_, nonce_, payload_);
        } catch (bytes memory reason_) {
            failedMessages[senderChainId_][senderAndReceiverAddresses_][nonce_] = keccak256(payload_);

            emit MessageFailed(senderChainId_, senderAndReceiverAddresses_, nonce_, payload_, reason_);
        }
    }

    function _nonblockingLzReceive(
        uint16 senderChainId_,
        bytes memory senderAndReceiverAddresses_,
        bytes memory payload_
    ) private {
        require(senderChainId_ == config.senderChainId, "L2MR: invalid sender chain ID");

        address sender_;
        assembly {
            sender_ := mload(add(senderAndReceiverAddresses_, 20))
        }
        require(sender_ == config.sender, "L2MR: invalid sender address");

        (address user_, uint256 amount_) = abi.decode(payload_, (address, uint256));

        IMOROFT(rewardToken).mint(user_, amount_);
    }

    function _authorizeUpgrade(address) internal view override onlyOwner {}
}
