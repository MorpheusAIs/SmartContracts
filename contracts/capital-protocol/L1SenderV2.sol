// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import {ISwapRouter} from "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import {TransferHelper} from "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";

import {ILayerZeroEndpoint} from "@layerzerolabs/lz-evm-sdk-v1-0.7/contracts/interfaces/ILayerZeroEndpoint.sol";

import {IGatewayRouter} from "@arbitrum/token-bridge-contracts/contracts/tokenbridge/libraries/gateway/IGatewayRouter.sol";

import {IL1SenderV2, IERC165} from "../interfaces/capital-protocol/IL1SenderV2.sol";
import {IDistributor} from "../interfaces/capital-protocol/IDistributor.sol";
import {IWStETH} from "../interfaces/tokens/IWStETH.sol";

contract L1SenderV2 is IL1SenderV2, OwnableUpgradeable, UUPSUpgradeable {
    /** @dev stETH token address */
    address public stETH;

    /** @dev `Distributor` contract address. */
    address public distributor;

    /** @dev The config for Arbitrum bridge. Send wstETH to the Arbitrum */
    ArbitrumBridgeConfig public arbitrumBridgeConfig;

    /** @dev The config for LayerZero. Send MOR mint message to the Arbitrum */
    LayerZeroConfig public layerZeroConfig;

    /** @dev UPGRADE `L1SenderV2` storage updates, add Uniswap integration  */
    address public uniswapSwapRouter;

    /**********************************************************************************************/
    /*** Init, IERC165                                                                          ***/
    /**********************************************************************************************/

    constructor() {
        _disableInitializers();
    }

    function L1SenderV2__init() external initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();
    }

    function supportsInterface(bytes4 interfaceId_) external pure returns (bool) {
        return interfaceId_ == type(IL1SenderV2).interfaceId || interfaceId_ == type(IERC165).interfaceId;
    }

    /**********************************************************************************************/
    /*** Global contract management functionality for the contract `owner()`                    ***/
    /**********************************************************************************************/

    function setStETh(address value_) external onlyOwner {
        require(value_ != address(0), "L1S: invalid stETH address");

        stETH = value_;

        emit stETHSet(value_);
    }

    function setDistributor(address value_) external onlyOwner {
        require(IERC165(value_).supportsInterface(type(IDistributor).interfaceId), "L1S: invalid distributor address");

        distributor = value_;

        emit DistributorSet(value_);
    }

    /**
     * https://docs.uniswap.org/contracts/v3/reference/deployments/ethereum-deployments
     */
    function setUniswapSwapRouter(address value_) external onlyOwner {
        require(value_ != address(0), "L1S: invalid `uniswapSwapRouter` address");

        uniswapSwapRouter = value_;

        emit UniswapSwapRouterSet(value_);
    }

    /**********************************************************************************************/
    /*** LayerZero functionality                                                                ***/
    /**********************************************************************************************/

    /**
     * @dev https://docs.layerzero.network/v1/deployments/deployed-contracts
     * Gateway - see `EndpointV1` at the link
     * Receiver - `L2MessageReceiver` address
     * Receiver Chain Id - see `EndpointId` at the link
     * Zro Payment Address - the address of the ZRO token holder who would pay for the transaction
     * Adapter Params - parameters for custom functionality. e.g. receive airdropped native gas from the relayer on destination
     */
    function setLayerZeroConfig(LayerZeroConfig calldata layerZeroConfig_) external onlyOwner {
        layerZeroConfig = layerZeroConfig_;

        emit LayerZeroConfigSet(layerZeroConfig_);
    }

    function sendMintMessage(address user_, uint256 amount_, address refundTo_) external payable {
        require(_msgSender() == distributor, "L1S: the `msg.sender` isn't `distributor`");

        LayerZeroConfig storage config = layerZeroConfig;

        bytes memory receiverAndSenderAddresses_ = abi.encodePacked(config.receiver, address(this));
        bytes memory payload_ = abi.encode(user_, amount_);

        // https://docs.layerzero.network/v1/developers/evm/evm-guides/send-messages
        ILayerZeroEndpoint(config.gateway).send{value: msg.value}(
            config.receiverChainId,
            receiverAndSenderAddresses_,
            payload_,
            payable(refundTo_),
            config.zroPaymentAddress,
            config.adapterParams
        );

        emit MintMessageSent(user_, amount_);
    }

    /**********************************************************************************************/
    /*** Arbitrum bridge functionality                                                          ***/
    /**********************************************************************************************/

    /**
     * @dev https://docs.arbitrum.io/build-decentralized-apps/reference/contract-addresses
     * wstETH - the wstETH token address
     * Gateway - see `L1 Gateway Router` at the link
     * Receiver - `L2MessageReceiver` address
     */
    function setArbitrumBridgeConfig(ArbitrumBridgeConfig calldata newConfig_) external onlyOwner {
        require(stETH != address(0), "L1S: stETH is not set");
        require(newConfig_.receiver != address(0), "L1S: invalid receiver");

        ArbitrumBridgeConfig memory oldConfig_ = arbitrumBridgeConfig;

        if (oldConfig_.wstETH != address(0)) {
            IERC20(stETH).approve(oldConfig_.wstETH, 0);
            IERC20(oldConfig_.wstETH).approve(IGatewayRouter(oldConfig_.gateway).getGateway(oldConfig_.wstETH), 0);
        }

        IERC20(stETH).approve(newConfig_.wstETH, type(uint256).max);
        IERC20(newConfig_.wstETH).approve(
            IGatewayRouter(newConfig_.gateway).getGateway(newConfig_.wstETH),
            type(uint256).max
        );

        arbitrumBridgeConfig = newConfig_;

        emit ArbitrumBridgeConfigSet(newConfig_);
    }

    function sendWstETH(
        uint256 gasLimit_,
        uint256 maxFeePerGas_,
        uint256 maxSubmissionCost_
    ) external payable onlyOwner returns (bytes memory) {
        ArbitrumBridgeConfig memory config_ = arbitrumBridgeConfig;
        require(config_.wstETH != address(0), "L1S: wstETH isn't set");

        uint256 stETHBalance_ = IERC20(stETH).balanceOf(address(this));
        if (stETHBalance_ > 0) {
            IWStETH(config_.wstETH).wrap(stETHBalance_);
        }

        uint256 amount_ = IWStETH(config_.wstETH).balanceOf(address(this));

        bytes memory data_ = abi.encode(maxSubmissionCost_, "");

        bytes memory res_ = IGatewayRouter(config_.gateway).outboundTransfer{value: msg.value}(
            config_.wstETH,
            config_.receiver,
            amount_,
            gasLimit_,
            maxFeePerGas_,
            data_
        );

        emit WstETHSent(amount_, gasLimit_, maxFeePerGas_, maxSubmissionCost_, res_);

        return res_;
    }

    /**********************************************************************************************/
    /*** Uniswap functionality                                                                  ***/
    /**********************************************************************************************/

    /**
     * @dev https://docs.uniswap.org/contracts/v3/guides/swaps/multihop-swaps
     *
     * Multiple pool swaps are encoded through bytes called a `path`. A path is a sequence
     * of token addresses and poolFees that define the pools used in the swaps.
     * The format for pool encoding is (tokenIn, fee, tokenOut/tokenIn, fee, tokenOut) where
     * tokenIn/tokenOut parameter is the shared token across the pools.
     * Since we are swapping DAI to USDC and then USDC to WETH9 the path encoding is (DAI, 0.3%, USDC, 0.3%, WETH9).
     */
    function swapExactInputMultihop(
        address[] calldata tokens_,
        uint24[] calldata poolsFee_,
        uint256 amountIn_,
        uint256 amountOutMinimum_,
        uint256 deadline_
    ) external onlyOwner returns (uint256) {
        require(tokens_.length >= 2 && tokens_.length == poolsFee_.length + 1, "L1S: invalid array length");
        require(amountIn_ != 0, "L1S: invalid `amountIn_` value");
        require(amountOutMinimum_ != 0, "L1S: invalid `amountOutMinimum_` value");

        TransferHelper.safeApprove(tokens_[0], uniswapSwapRouter, amountIn_);

        // START create the `path`
        bytes memory path_;
        for (uint256 i = 0; i < poolsFee_.length; i++) {
            path_ = abi.encodePacked(path_, tokens_[i], poolsFee_[i]);
        }
        path_ = abi.encodePacked(path_, tokens_[tokens_.length - 1]);
        // END

        ISwapRouter.ExactInputParams memory params_ = ISwapRouter.ExactInputParams({
            path: path_,
            recipient: address(this),
            deadline: deadline_,
            amountIn: amountIn_,
            amountOutMinimum: amountOutMinimum_
        });

        uint256 amountOut_ = ISwapRouter(uniswapSwapRouter).exactInput(params_);

        emit TokensSwapped(path_, amountIn_, amountOut_);

        return amountOut_;
    }

    /**********************************************************************************************/
    /*** UUPS                                                                                   ***/
    /**********************************************************************************************/

    function version() external pure returns (uint256) {
        return 2;
    }

    function _authorizeUpgrade(address) internal view override onlyOwner {}
}
