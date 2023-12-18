// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import {ILayerZeroEndpoint} from "@layerzerolabs/lz-evm-sdk-v1-0.7/contracts/interfaces/ILayerZeroEndpoint.sol";

import {IGatewayRouter} from "@arbitrum/token-bridge-contracts/contracts/tokenbridge/libraries/gateway/IGatewayRouter.sol";

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IMOR} from "./interfaces/IMOR.sol";
import {IL1Sender} from "./interfaces/IL1Sender.sol";

contract L1Sender is IL1Sender, ERC165, Ownable {
    using SafeERC20 for IERC20;

    address public l1GatewayRouter;
    address public depositToken;

    LzConfig public config;

    constructor(address l1GatewayRouter_, address depositToken_, LzConfig memory config_) payable {
        l1GatewayRouter = l1GatewayRouter_;
        depositToken = depositToken_;
        config = config_;
    }

    function bridgedepositTokens(
        uint256 amount_,
        address recipient_,
        uint256 gasLimit_,
        uint256 maxFeePerGas_,
        uint256 maxSubmissionCost_
    ) external payable returns (bytes memory) {
        IERC20(depositToken).safeTransferFrom(_msgSender(), address(this), amount_);
        IERC20(depositToken).approve(IGatewayRouter(l1GatewayRouter).getGateway(depositToken), amount_);

        bytes memory data = abi.encode(maxSubmissionCost_, "");

        return
            IGatewayRouter(l1GatewayRouter).outboundTransfer{value: msg.value}(
                depositToken,
                recipient_,
                amount_,
                gasLimit_,
                maxFeePerGas_,
                data
            );
    }

    function sendMintRewardMessage(address user_, uint256 amount_) external payable onlyOwner {
        bytes memory receiverAndSenderAddresses_ = abi.encodePacked(config.communicator, address(this));
        bytes memory payload_ = abi.encode(user_, amount_);

        ILayerZeroEndpoint(config.lzEndpoint).send{value: 0.1 ether}(
            config.communicatorChainId, // destination LayerZero chainId
            receiverAndSenderAddresses_, // send to this address on the destination
            payload_, // bytes payload
            payable(tx.origin), // refund address TODO: CHANGE TO msg.sender
            address(0x0), // future parameter
            bytes("") // adapterParams (see "Advanced Features")
        );
    }
}
