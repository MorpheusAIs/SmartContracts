// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import {ISwapRouter} from "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import {TransferHelper} from "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";

import {ILayerZeroEndpoint} from "@layerzerolabs/lz-evm-sdk-v1-0.7/contracts/interfaces/ILayerZeroEndpoint.sol";

import {IGatewayRouter} from "@arbitrum/token-bridge-contracts/contracts/tokenbridge/libraries/gateway/IGatewayRouter.sol";

import {IL1SenderV3, IERC165} from "../interfaces/capital-protocol/IL1SenderV3.sol";
import {IDistributor} from "../interfaces/capital-protocol/IDistributor.sol";
import {IWStETH} from "../interfaces/tokens/IWStETH.sol";
import {IL1ERC20Bridge} from "../interfaces/@lidofinance/lido-l2/contracts/optimism/interfaces/IL1ERC20Bridge.sol";

contract L1SenderV3 is IL1SenderV3, OwnableUpgradeable, UUPSUpgradeable {
    /** @dev stETH token address */
    address public stETH;

    /** @dev `Distributor` contract address. */
    address public distributor;

    /** @dev The config for Arbitrum bridge. Send wstETH to the Arbitrum */
    TokenBridgeConfig public tokenBridgeConfig;

    /** @dev The config for LayerZero. Send MOR mint message to the Arbitrum */
    MessageBridgeConfig public messageBridgeConfig;

    /** @dev UPGRADE `L1SenderV2` storage updates, add Uniswap integration  */
    address public uniswapSwapRouter;

    /**********************************************************************************************/
    /*** Init, IERC165                                                                          ***/
    /**********************************************************************************************/

    constructor() {
        _disableInitializers();
    }

    function L1SenderV3__init() external initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();
    }

    function supportsInterface(bytes4 interfaceId_) external pure returns (bool) {
        return interfaceId_ == type(IL1SenderV3).interfaceId || interfaceId_ == type(IERC165).interfaceId;
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
    function setMessageBridgeConfig(MessageBridgeConfig calldata config_) external onlyOwner {
        messageBridgeConfig = config_;

        emit MessageBridgeConfigSet(messageBridgeConfig);
    }

    function sendMintMessage(address user_, uint256 amount_, address refundTo_) external payable {
        require(_msgSender() == distributor, "L1S: the `msg.sender` isn't `distributor`");

        MessageBridgeConfig storage config = messageBridgeConfig;

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
    /*** Lido bridge functionality                                                              ***/
    /**********************************************************************************************/

    /**
     * @dev https://docs.lido.fi/deployed-contracts/#base
     * wstETH - see `WstETH ERC20Bridged (proxy)` at the link
     * Gateway - see `L1ERC20TokenBridge (proxy)` at the link
     * Receiver - token receiver address on L2
     */
    function setTokenBridgeConfig(TokenBridgeConfig calldata config_) external onlyOwner {
        require(stETH != address(0), "L1S: stETH is not set");
        require(config_.receiver != address(0), "L1S: invalid receiver");

        TokenBridgeConfig memory oldConfig_ = tokenBridgeConfig;

        if (oldConfig_.wstETH != address(0)) {
            IERC20(stETH).approve(oldConfig_.wstETH, 0);

            address oldGateway_;
            try IGatewayRouter(oldConfig_.gateway).getGateway(oldConfig_.wstETH) returns (address gateway_) {
                oldGateway_ = gateway_;
            } catch {
                oldGateway_ = oldConfig_.gateway;
            }
            IERC20(oldConfig_.wstETH).approve(oldGateway_, 0);
        }

        IERC20(stETH).approve(config_.wstETH, type(uint256).max);
        IERC20(config_.wstETH).approve(config_.gateway, type(uint256).max);

        tokenBridgeConfig = config_;

        emit TokenBridgeConfigSet(tokenBridgeConfig);
    }

    function sendWstETH(uint32 l2Gas_, bytes calldata data_) external onlyOwner {
        TokenBridgeConfig memory config_ = tokenBridgeConfig;
        require(config_.wstETH != address(0), "L1S: wstETH isn't set");

        uint256 stETHBalance_ = IERC20(stETH).balanceOf(address(this));
        if (stETHBalance_ > 0) {
            IWStETH(config_.wstETH).wrap(stETHBalance_);
        }

        uint256 amount_ = IWStETH(config_.wstETH).balanceOf(address(this));

        IL1ERC20Bridge l1ERC20Bridge_ = IL1ERC20Bridge(config_.gateway);
        l1ERC20Bridge_.depositERC20To(
            config_.wstETH,
            l1ERC20Bridge_.l2Token(),
            config_.receiver,
            amount_,
            l2Gas_,
            data_
        );

        emit TokenSent(amount_, config_.receiver, l2Gas_, data_);
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
        return 3;
    }

    function _authorizeUpgrade(address) internal view override onlyOwner {}
}
