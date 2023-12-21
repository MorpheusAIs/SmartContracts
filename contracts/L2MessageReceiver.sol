// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {ILayerZeroReceiver} from "@layerzerolabs/lz-evm-sdk-v1-0.7/contracts/interfaces/ILayerZeroReceiver.sol";

import {IMOR} from "./interfaces/IMOR.sol";
import {IL1Sender} from "./interfaces/IL1Sender.sol";
import {IL2MessageReceiver} from "./interfaces/IL2MessageReceiver.sol";

contract L2MessageReceiver is IL2MessageReceiver, ILayerZeroReceiver, Ownable {
    uint64 public nonce;
    address public rewardToken;

    Config public config;

    function setConfig(Config calldata config_) external onlyOwner {
        config = config_;
    }

    function lzReceive(
        uint16 senderChainId_,
        bytes memory receiverAndSenderAddresses_,
        uint64 nonce_,
        bytes memory payload_
    ) external {
        require(nonce_ > nonce, "TC: invalid nonce");
        require(_msgSender() == config.gateway, "TC: invalid gateway");
        require(senderChainId_ == config.senderChainId, "TC: invalid sender chain ID");

        address sender_;
        assembly {
            sender_ := mload(add(receiverAndSenderAddresses_, 20))
        }
        require(sender_ == config.sender, "TC: invalid sender address");

        (address user_, uint256 amount_) = abi.decode(payload_, (address, uint256));

        nonce = nonce_;
        _mintRewardTokens(user_, amount_);
    }

    function _mintRewardTokens(address user_, uint256 amount_) private {
        uint256 maxAmount_ = IMOR(rewardToken).cap() - IMOR(rewardToken).totalSupply();

        if (amount_ == 0 || maxAmount_ == 0) {
            return;
        }

        if (amount_ > maxAmount_) {
            amount_ = maxAmount_;
        }

        IMOR(rewardToken).mint(user_, amount_);
    }
}
