// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {ILayerZeroReceiver} from "@layerzerolabs/lz-evm-sdk-v1-0.7/contracts/interfaces/ILayerZeroReceiver.sol";

import {IMOR} from "./interfaces/IMOR.sol";
import {ISwap} from "./interfaces/ISwap.sol";
import {IBridge} from "./interfaces/IBridge.sol";
import {ITokenController} from "./interfaces/ITokenController.sol";

contract TokenController is ITokenController, ILayerZeroReceiver, Ownable {
    address public investToken;
    address public rewardToken;
    address public swap;

    uint64 public nonce;

    IBridge.LzConfig public config;

    constructor(address investToken_, address rewardToken_, address swap_, IBridge.LzConfig memory config_) {
        investToken = investToken_;
        rewardToken = rewardToken_;
        swap = swap_;
        config = config_;

        IERC20(investToken_).approve(swap, type(uint256).max);
    }

    function setParams(address investToken_, address rewardToken_, IBridge.LzConfig memory config_) external onlyOwner {
        investToken = investToken_;
        rewardToken = rewardToken_;
        config = config_;
    }

    function swapAndAddLiquidity(uint256 amountIn_, uint256 amountOutMinimum_, uint256 tokenId_) external {
        ISwap(swap).swap(amountIn_, amountOutMinimum_);

        ISwap(swap).increaseLiquidityCurrentRange(
            tokenId_,
            IERC20(investToken).balanceOf(address(this)),
            IERC20(rewardToken).balanceOf(address(this))
        );
    }

    function lzReceive(
        uint16 senderChainId_,
        bytes memory receiverAndSenderAddresses_,
        uint64 nonce_,
        bytes memory payload_
    ) external {
        require(nonce_ > nonce, "Rec: invalid nonce"); // do we need this?
        require(msg.sender == address(config.lzEndpoint), "Rec: invalid lz endpoint");
        require(senderChainId_ == config.communicatorChainId, "Rec: invalid sender chain ID");

        address sender_;
        assembly {
            sender_ := mload(add(receiverAndSenderAddresses_, 20))
        }
        require(sender_ == config.communicator, "Rec: invalid sender address");

        nonce = nonce_;

        (address user_, uint256 amount_) = abi.decode(payload_, (address, uint256));

        IMOR(rewardToken).mint(user_, amount_);
    }
}
