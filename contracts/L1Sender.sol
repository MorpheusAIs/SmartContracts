// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import {ILayerZeroEndpoint} from "@layerzerolabs/lz-evm-sdk-v1-0.7/contracts/interfaces/ILayerZeroEndpoint.sol";

import {IGatewayRouter} from "@arbitrum/token-bridge-contracts/contracts/tokenbridge/libraries/gateway/IGatewayRouter.sol";

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IWStETH} from "./interfaces/tokens/IWStETH.sol";
import {IMOR} from "./interfaces/IMOR.sol";
import {IL1Sender} from "./interfaces/IL1Sender.sol";

contract L1Sender is IL1Sender, ERC165, Ownable {
    DepositTokenConfig public depositTokenConfig;
    RewardTokenConfig public rewardTokenConfig;

    function setRewardTokenConfig(RewardTokenConfig calldata newConfig_) external onlyOwner {
        rewardTokenConfig = newConfig_;
    }

    function setDepositTokenConfig(DepositTokenConfig calldata newConfig_) external onlyOwner {
        require(newConfig_.receiver != address(0), "L1S: invalid receiver");

        DepositTokenConfig storage oldConfig = depositTokenConfig;

        bool isTokenChanged = oldConfig.token != newConfig_.token;
        bool isGatewayChanged = oldConfig.gateway != newConfig_.gateway;
        bool isConfigAdded = oldConfig.token != address(0);

        // Remove old allowance
        if (isConfigAdded && (isTokenChanged || isGatewayChanged)) {
            address tokenGateway = IGatewayRouter(oldConfig.gateway).getGateway(oldConfig.token);
            IERC20(oldConfig.token).approve(tokenGateway, 0);
        }

        // Add new allowance
        if (isTokenChanged || isGatewayChanged) {
            address tokenGateway = IGatewayRouter(newConfig_.gateway).getGateway(newConfig_.token);
            IERC20(newConfig_.token).approve(tokenGateway, type(uint256).max);
        }

        depositTokenConfig = newConfig_;
    }

    function sendDepositToken(
        uint256 gasLimit_,
        uint256 maxFeePerGas_,
        uint256 maxSubmissionCost_
    ) external payable returns (bytes memory) {
        DepositTokenConfig storage config = depositTokenConfig;

        // Get stETH address from wstETH
        address unwrappedToken = IWStETH(config.token).stETH();
        // Get current stETH balance
        uint256 amountUnwrappedToken = IERC20(unwrappedToken).balanceOf(address(this));
        // Wrap all stETH to wstETH
        uint256 amount_ = IWStETH(config.token).wrap(amountUnwrappedToken);

        bytes memory data_ = abi.encode(maxSubmissionCost_, "");

        return
            IGatewayRouter(config.gateway).outboundTransfer{value: msg.value}(
                config.token,
                config.receiver,
                amount_,
                gasLimit_,
                maxFeePerGas_,
                data_
            );
    }

    function sendMintMessage(address user_, uint256 amount_, address refundTo_) external payable onlyOwner {
        RewardTokenConfig storage config = rewardTokenConfig;

        bytes memory receiverAndSenderAddresses_ = abi.encodePacked(config.receiver, address(this));
        bytes memory payload_ = abi.encode(user_, amount_);

        ILayerZeroEndpoint(config.gateway).send{value: msg.value}(
            config.receiverChainId, // communicator LayerZero chainId
            receiverAndSenderAddresses_, // send to this address to the communicator
            payload_, // bytes payload
            payable(refundTo_), // refund address
            address(0x0), // future parameter
            bytes("") // adapterParams (see "Advanced Features")
        );
    }
}
