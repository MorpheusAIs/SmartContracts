// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ILayerZeroReceiver} from "@layerzerolabs/lz-evm-sdk-v1-0.7/contracts/interfaces/ILayerZeroReceiver.sol";

import {IMOR} from "./interfaces/IMOR.sol";
import {IL1Sender} from "./interfaces/IL1Sender.sol";
import {IL2MessageReceiver} from "./interfaces/IL2MessageReceiver.sol";

contract L2MessageReceiver is IL2MessageReceiver, ILayerZeroReceiver, OwnableUpgradeable, UUPSUpgradeable {
    uint64 public nonce;
    address public rewardToken;

    Config public config;

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
        bytes memory receiverAndSenderAddresses_,
        uint64 nonce_,
        bytes memory payload_
    ) external {
        require(nonce_ > nonce, "L2MR: invalid nonce");
        require(_msgSender() == config.gateway, "L2MR: invalid gateway");
        require(senderChainId_ == config.senderChainId, "L2MR: invalid sender chain ID");

        address sender_;
        assembly {
            sender_ := mload(add(receiverAndSenderAddresses_, 20))
        }
        require(sender_ == config.sender, "L2MR: invalid sender address");

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

    function _authorizeUpgrade(address) internal view override onlyOwner {}
}
