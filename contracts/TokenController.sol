// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {ILayerZeroReceiver} from "@layerzerolabs/lz-evm-sdk-v1-0.7/contracts/interfaces/ILayerZeroReceiver.sol";

import {IMOR} from "./interfaces/IMOR.sol";
import {ISwap} from "./interfaces/ISwap.sol";
import {IL1Sender} from "./interfaces/IL1Sender.sol";
import {ITokenController} from "./interfaces/ITokenController.sol";

contract TokenController is ITokenController, ILayerZeroReceiver, Ownable {
    address public depositToken;
    address public rewardToken;
    address public swap;

    uint64 public nonce;

    IL1Sender.LzConfig public config;

    constructor(address depositToken_, address rewardToken_, address swap_, IL1Sender.LzConfig memory config_) {
        depositToken = depositToken_;
        rewardToken = rewardToken_;
        swap = swap_;
        config = config_;

        IERC20(depositToken_).approve(swap, type(uint256).max);
    }

    function setParams(
        address depositToken_,
        address rewardToken_,
        IL1Sender.LzConfig memory config_
    ) external onlyOwner {
        depositToken = depositToken_;
        rewardToken = rewardToken_;
        config = config_;
    }

    function swapAndAddLiquidity(uint256 amountIn_, uint256 amountOutMinimum_, uint256 tokenId_) external {
        ISwap(swap).swap(amountIn_, amountOutMinimum_);

        ISwap(swap).increaseLiquidityCurrentRange(
            tokenId_,
            IERC20(depositToken).balanceOf(address(this)),
            IERC20(rewardToken).balanceOf(address(this))
        );
    }

    function lzReceive(
        uint16 senderChainId_,
        bytes memory receiverAndSenderAddresses_,
        uint64 nonce_,
        bytes memory payload_
    ) external {
        require(nonce_ > nonce, "TC: invalid nonce"); // do we need this?
        require(msg.sender == config.lzEndpoint, "TC: invalid lz endpoint");
        require(senderChainId_ == config.communicatorChainId, "TC: invalid sender chain ID");

        address sender_;
        assembly {
            sender_ := mload(add(receiverAndSenderAddresses_, 20))
        }
        require(sender_ == config.communicator, "TC: invalid sender address");

        nonce = nonce_;

        (address user_, uint256 amount_) = abi.decode(payload_, (address, uint256));

        _mintRewardTokens(user_, amount_);
    }

    function _mintRewardTokens(address user_, uint256 amount_) internal {
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
