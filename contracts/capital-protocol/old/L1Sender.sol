// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ILayerZeroEndpoint} from "@layerzerolabs/lz-evm-sdk-v1-0.7/contracts/interfaces/ILayerZeroEndpoint.sol";

import {IGatewayRouter} from "@arbitrum/token-bridge-contracts/contracts/tokenbridge/libraries/gateway/IGatewayRouter.sol";

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import {IL1Sender, IERC165} from "../../interfaces/capital-protocol/old/IL1Sender.sol";
import {IWStETH} from "../../interfaces/tokens/IWStETH.sol";

contract L1Sender is IL1Sender, OwnableUpgradeable, UUPSUpgradeable {
    address public unwrappedDepositToken;
    address public distribution;

    DepositTokenConfig public depositTokenConfig;
    RewardTokenConfig public rewardTokenConfig;

    modifier onlyDistribution() {
        require(_msgSender() == distribution, "L1S: invalid sender");
        _;
    }

    constructor() {
        _disableInitializers();
    }

    function L1Sender__init(
        address distribution_,
        RewardTokenConfig calldata rewardTokenConfig_,
        DepositTokenConfig calldata depositTokenConfig_
    ) external initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();

        setDistribution(distribution_);
        setRewardTokenConfig(rewardTokenConfig_);
        setDepositTokenConfig(depositTokenConfig_);
    }

    function supportsInterface(bytes4 interfaceId_) external pure returns (bool) {
        return interfaceId_ == type(IL1Sender).interfaceId || interfaceId_ == type(IERC165).interfaceId;
    }

    function setDistribution(address distribution_) public onlyOwner {
        distribution = distribution_;
    }

    function setRewardTokenConfig(RewardTokenConfig calldata newConfig_) public onlyOwner {
        rewardTokenConfig = newConfig_;
    }

    function setDepositTokenConfig(DepositTokenConfig calldata newConfig_) public onlyOwner {
        require(newConfig_.receiver != address(0), "L1S: invalid receiver");

        DepositTokenConfig storage oldConfig = depositTokenConfig;

        _replaceDepositToken(oldConfig.token, newConfig_.token);
        _replaceDepositTokenGateway(oldConfig.gateway, newConfig_.gateway, oldConfig.token, newConfig_.token);

        depositTokenConfig = newConfig_;
    }

    function _replaceDepositToken(address oldToken_, address newToken_) private {
        bool isTokenChanged_ = oldToken_ != newToken_;

        if (oldToken_ != address(0) && isTokenChanged_) {
            // Remove allowance from stETH to wstETH
            IERC20(unwrappedDepositToken).approve(oldToken_, 0);
        }

        if (isTokenChanged_) {
            // Get stETH from wstETH
            address unwrappedToken_ = IWStETH(newToken_).stETH();
            // Increase allowance from stETH to wstETH. To exchange stETH for wstETH
            IERC20(unwrappedToken_).approve(newToken_, type(uint256).max);

            unwrappedDepositToken = unwrappedToken_;
        }
    }

    function _replaceDepositTokenGateway(
        address oldGateway_,
        address newGateway_,
        address oldToken_,
        address newToken_
    ) private {
        bool isAllowedChanged_ = (oldToken_ != newToken_) || (oldGateway_ != newGateway_);

        if (oldGateway_ != address(0) && isAllowedChanged_) {
            IERC20(oldToken_).approve(IGatewayRouter(oldGateway_).getGateway(oldToken_), 0);
        }

        if (isAllowedChanged_) {
            IERC20(newToken_).approve(IGatewayRouter(newGateway_).getGateway(newToken_), type(uint256).max);
        }
    }

    function sendDepositToken(
        uint256 gasLimit_,
        uint256 maxFeePerGas_,
        uint256 maxSubmissionCost_
    ) external payable onlyDistribution returns (bytes memory) {
        DepositTokenConfig storage config = depositTokenConfig;

        // Get current stETH balance
        uint256 amountUnwrappedToken_ = IERC20(unwrappedDepositToken).balanceOf(address(this));
        // Wrap all stETH to wstETH
        uint256 amount_ = IWStETH(config.token).wrap(amountUnwrappedToken_);

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

    function sendMintMessage(address user_, uint256 amount_, address refundTo_) external payable onlyDistribution {
        RewardTokenConfig storage config = rewardTokenConfig;

        bytes memory receiverAndSenderAddresses_ = abi.encodePacked(config.receiver, address(this));
        bytes memory payload_ = abi.encode(user_, amount_);

        ILayerZeroEndpoint(config.gateway).send{value: msg.value}(
            config.receiverChainId, // communicator LayerZero chainId
            receiverAndSenderAddresses_, // send to this address to the communicator
            payload_, // bytes payload
            payable(refundTo_), // refund address
            config.zroPaymentAddress, // future parameter
            config.adapterParams // adapterParams (see "Advanced Features")
        );
    }

    function _authorizeUpgrade(address) internal view override onlyOwner {}
}
