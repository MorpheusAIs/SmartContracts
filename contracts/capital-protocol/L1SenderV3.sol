// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import {ISwapRouter} from "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import {TransferHelper} from "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";

import {ILayerZeroEndpointV2, MessagingParams} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";

import {IGatewayRouter} from "@arbitrum/token-bridge-contracts/contracts/tokenbridge/libraries/gateway/IGatewayRouter.sol";
import {IL1StandardBridge} from "../interfaces/base/IL1StandardBridge.sol";

import {IL1SenderV3, IERC165} from "../interfaces/capital-protocol/IL1SenderV3.sol";
import {IDistributorV3} from "../interfaces/capital-protocol/IDistributorV3.sol";
import {IWStETH} from "../interfaces/tokens/IWStETH.sol";

contract L1SenderV3 is IL1SenderV3, OwnableUpgradeable, UUPSUpgradeable {
    /** @dev stETH token address */
    address public stETH;

    /** @dev `Distributor` contract address. */
    address public distributor;

    /** @dev The config for Arbitrum bridge. Send wstETH to the Arbitrum */
    ArbitrumBridgeConfig public arbitrumBridgeConfig;

    /**
     * @dev The config for LayerZero V1. Send MOR mint message to the Arbitrum.
     * UPGRADE `L1SenderV3` storage updates, removed the LayerZero V1 setter (`setLayerZeroConfig`),
     * superseded by `lzEndpointV2`/`lzV2Configs` below. Slot kept, no longer written to.
     */
    LayerZeroConfig public unusedStorage0;

    /** @dev UPGRADE `L1SenderV2` storage updates, add Uniswap integration  */
    address public uniswapSwapRouter;

    /**
     * @dev UPGRADE `L1SenderV2` storage updates, add LayerZero V2 mint-message channel.
     * `layerZeroConfig` (V1, above) is left in place but unused going forward.
     */
    /** @dev LayerZero V2 `EndpointV2` address for this chain. See https://docs.layerzero.network/v2/deployments/deployed-contracts */
    address public lzEndpointV2;

    /** @dev Destination chain id used by `sendMintMessage()` when the caller doesn't specify one (i.e. passes `0`). */
    uint32 public defaultChainId;

    /** @dev Per-destination-chain LayerZero V2 config (receiver + execution options). Keyed by chain id. */
    mapping(uint32 => LayerZeroV2Config) public lzV2Configs;

    /** @dev UPGRADE `L1SenderV2` storage updates, add Base (OP Stack) wstETH bridge */
    /** @dev The config for the Base bridge. Send wstETH to Base. */
    BaseBridgeConfig public baseBridgeConfig;

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
        require(
            IERC165(value_).supportsInterface(type(IDistributorV3).interfaceId),
            "L1S: invalid distributor address"
        );

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
     * @dev https://docs.layerzero.network/v2/deployments/deployed-contracts
     */
    function setLzEndpointV2(address value_) external onlyOwner {
        require(value_ != address(0), "L1S: invalid `lzEndpointV2` address");

        lzEndpointV2 = value_;

        emit LzEndpointV2Set(value_);
    }

    function setDefaultChainId(uint32 chainId_) external onlyOwner {
        defaultChainId = chainId_;

        emit DefaultChainIdSet(chainId_);
    }

    /**
     * @dev `config_.receiver` is the `L2MessageReceiverV2` address on `chainId_`, left-padded to
     * `bytes32` (same convention as `OAppCore.peers`).
     */
    function setLzV2Config(uint32 chainId_, LayerZeroV2Config calldata config_) external onlyOwner {
        require(config_.receiver != bytes32(0), "L1S: invalid receiver");

        lzV2Configs[chainId_] = config_;

        emit LzV2ConfigSet(chainId_, config_);
    }

    /**
     * @dev Sends to `defaultChainId`, for callers that don't need to pick a network.
     */
    function sendMintMessage(address user_, uint256 amount_, address refundTo_) external payable {
        _sendMintMessage(user_, amount_, refundTo_, 0);
    }

    /**
     * @dev `chainId_ == 0` is treated as "use `defaultChainId`" — the same sentinel is used all the
     * way up the call chain (`DepositPool` -> `Distributor` -> here), so callers that don't care
     * about the destination network can simply pass `0` instead of looking up the Arbitrum chain id.
     */
    function sendMintMessage(address user_, uint256 amount_, address refundTo_, uint32 chainId_) external payable {
        _sendMintMessage(user_, amount_, refundTo_, chainId_);
    }

    function _sendMintMessage(address user_, uint256 amount_, address refundTo_, uint32 chainId_) private {
        require(_msgSender() == distributor, "L1S: the `msg.sender` isn't `distributor`");

        if (chainId_ == 0) {
            chainId_ = defaultChainId;
        }

        LayerZeroV2Config storage config_ = lzV2Configs[chainId_];
        require(config_.receiver != bytes32(0), "L1S: no LZ V2 config for `chainId_`");

        bytes memory message_ = abi.encode(user_, amount_);

        // https://docs.layerzero.network/v2/developers/evm/oapp/overview#sending-a-message
        ILayerZeroEndpointV2(lzEndpointV2).send{value: msg.value}(
            MessagingParams(chainId_, config_.receiver, message_, config_.options, false),
            payable(refundTo_)
        );

        emit MintMessageSentV2(user_, amount_, chainId_);
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
    /*** Base bridge functionality                                                              ***/
    /**********************************************************************************************/

    /**
     * @dev https://docs.base.org/base-chain/network-information/base-contracts
     * wstETH - the L1 wstETH token address (same token as `arbitrumBridgeConfig.wstETH`)
     * remoteWstETH - the bridged wstETH address on Base
     * bridge - `L1StandardBridge` ("Base: Base Bridge")
     * Receiver - `L2TokenReceiverV2` address on Base
     */
    function setBaseBridgeConfig(BaseBridgeConfig calldata newConfig_) external onlyOwner {
        require(stETH != address(0), "L1S: stETH is not set");
        require(newConfig_.receiver != address(0), "L1S: invalid receiver");

        BaseBridgeConfig memory oldConfig_ = baseBridgeConfig;

        if (oldConfig_.wstETH != address(0)) {
            IERC20(stETH).approve(oldConfig_.wstETH, 0);
            IERC20(oldConfig_.wstETH).approve(oldConfig_.bridge, 0);
        }

        IERC20(stETH).approve(newConfig_.wstETH, type(uint256).max);
        IERC20(newConfig_.wstETH).approve(newConfig_.bridge, type(uint256).max);

        baseBridgeConfig = newConfig_;

        emit BaseBridgeConfigSet(newConfig_);
    }

    /**
     * @dev Unlike `sendWstETH` (Arbitrum retryable tickets), the OP Stack bridge relays L1 deposits
     * without a prepaid L2 gas fee from the sender -- no `msg.value`, no `maxFeePerGas_`/
     * `maxSubmissionCost_` equivalent. `minGasLimit_` only caps the L2-side execution.
     */
    function sendWstETHToBase(uint32 minGasLimit_, bytes calldata extraData_) external onlyOwner {
        BaseBridgeConfig memory config_ = baseBridgeConfig;
        require(config_.wstETH != address(0), "L1S: wstETH isn't set");

        uint256 stETHBalance_ = IERC20(stETH).balanceOf(address(this));
        if (stETHBalance_ > 0) {
            IWStETH(config_.wstETH).wrap(stETHBalance_);
        }

        uint256 amount_ = IWStETH(config_.wstETH).balanceOf(address(this));

        IL1StandardBridge(config_.bridge).bridgeERC20To(
            config_.wstETH,
            config_.remoteWstETH,
            config_.receiver,
            amount_,
            minGasLimit_,
            extraData_
        );

        emit WstETHSentToBase(amount_, minGasLimit_, extraData_);
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
