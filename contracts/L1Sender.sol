// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import {ILayerZeroEndpoint} from "@layerzerolabs/lz-evm-sdk-v1-0.7/contracts/interfaces/ILayerZeroEndpoint.sol";

import {IGatewayRouter} from "@arbitrum/token-bridge-contracts/contracts/tokenbridge/libraries/gateway/IGatewayRouter.sol";

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IWStETH} from "./interfaces/tokens/IWStETH.sol";
import {IStETH} from "./interfaces/tokens/IStETH.sol";
import {IMOR} from "./interfaces/IMOR.sol";
import {IL1Sender} from "./interfaces/IL1Sender.sol";

contract L1Sender is IL1Sender, ERC165, Ownable {
    address public unwrappedDepositToken;

    DepositTokenConfig public depositTokenConfig;
    RewardTokenConfig public rewardTokenConfig;

    function setRewardTokenConfig(RewardTokenConfig calldata newConfig_) external onlyOwner {
        rewardTokenConfig = newConfig_;
    }

    function setDepositTokenConfig(DepositTokenConfig calldata newConfig_) external onlyOwner {
        require(newConfig_.receiver != address(0), "L1S: invalid receiver");

        DepositTokenConfig storage oldConfig = depositTokenConfig;

        _replaceDepositToken(oldConfig.token, newConfig_.token);
        _replaceDepositTokenGateway(oldConfig.gateway, newConfig_.gateway, oldConfig.token, newConfig_.token);

        depositTokenConfig = newConfig_;
    }

    function _replaceDepositToken(address oldToken_, address newToken_) private {
        bool isTokenChanged = oldToken_ != newToken_;

        if (oldToken_ != address(0) && isTokenChanged) {
            // Remove allowance from stETH to wstETH
            IERC20(unwrappedDepositToken).approve(oldToken_, 0);
        }

        if (isTokenChanged) {
            // Get stETH from wstETH
            address unwrappedToken = IWStETH(newToken_).stETH();
            // Increase allowance from stETH to wstETH. To exchange stETH for wstETH
            IERC20(unwrappedToken).approve(newToken_, type(uint256).max);

            unwrappedDepositToken = unwrappedToken;
        }
    }

    function _replaceDepositTokenGateway(
        address oldGateway_,
        address newGateway_,
        address oldToken_,
        address newToken_
    ) private {
        bool isTokenChanged = oldToken_ != newToken_;
        bool isGatewayChanged = oldGateway_ != newGateway_;

        if (oldGateway_ != address(0) && (isTokenChanged || isGatewayChanged)) {
            IERC20(oldToken_).approve(oldGateway_, 0);
        }

        if (isTokenChanged || isGatewayChanged) {
            IERC20(newToken_).approve(newGateway_, type(uint256).max);
        }
    }

    function sendDepositToken(
        uint256 gasLimit_,
        uint256 maxFeePerGas_,
        uint256 maxSubmissionCost_
    ) external payable returns (bytes memory) {
        DepositTokenConfig storage config = depositTokenConfig;

        // Get current stETH balance
        uint256 amountUnwrappedToken = IERC20(unwrappedDepositToken).balanceOf(address(this));
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
