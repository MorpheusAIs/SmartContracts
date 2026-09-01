// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

/**
 * @title IL1SenderV3
 * @notice Defines the basic interface for the L1SenderV3
 */
interface IL1SenderV3 is IERC165 {
    event stETHSet(address stETH);
    event DistributorSet(address distributor);
    event UniswapSwapRouterSet(address uniswapSwapRouter);
    event LayerZeroConfigSet(LayerZeroConfig layerZeroConfig);
    event MintMessageSent(address user, uint256 amount);
    event ArbitrumBridgeConfigSet(ArbitrumBridgeConfig arbitrumBridgeConfig);
    event WstETHSent(uint256 amount, uint256 gasLimit, uint256 maxFeePerGas, uint256 maxSubmissionCost, bytes result);
    event TokensSwapped(bytes path, uint256 amountIn, uint256 amountOut);

    /**
     * @notice The event that is emitted when the LayerZero V2 endpoint address is set.
     * @param lzEndpointV2 The LayerZero V2 endpoint address.
     */
    event LzEndpointV2Set(address lzEndpointV2);

    /**
     * @notice The event that is emitted when the LayerZero V2 endpoint delegate is set.
     * @param delegate The delegate address.
     */
    event LzDelegateSet(address delegate);

    /**
     * @notice The event that is emitted when the default destination endpoint id is set.
     * @param defaultChainId The default destination endpoint id, used when `sendMintMessage()`
     * is called without an explicit `chainId_` (i.e. through the legacy 3-argument signature).
     */
    event DefaultChainIdSet(uint32 defaultChainId);

    /**
     * @notice The event that is emitted when the LayerZero V2 config for a destination is set.
     * @param chainId The destination endpoint id.
     * @param lzV2Config The config.
     */
    event LzV2ConfigSet(uint32 chainId, LayerZeroV2Config lzV2Config);

    /**
     * @notice The event that is emitted when a LayerZero V2 mint message is sent.
     * @param user The user's address receiver.
     * @param amount The amount of reward token to mint.
     * @param chainId The destination endpoint id.
     */
    event MintMessageSentV2(address user, uint256 amount, uint32 chainId);

    /**
     * @notice The event that is emitted when the Base bridge config is set.
     * @param baseBridgeConfig The config.
     */
    event BaseBridgeConfigSet(BaseBridgeConfig baseBridgeConfig);

    /**
     * @notice The event that is emitted when wstETH is sent to Base.
     * @param amount The amount of wstETH sent.
     * @param l2Gas The L2 finalization gas limit passed to the bridge.
     * @param extraData The extra data passed to the bridge.
     */
    event WstETHSentToBase(uint256 amount, uint32 l2Gas, bytes extraData);

    /**
     * @notice The structure that stores the deposit token's (stETH) data.
     * @param wstETH The address of wrapped deposit token.
     * @param gateway The address of token's gateway.
     * @param receiver The address of wrapped token's receiver on L2.
     */
    struct ArbitrumBridgeConfig {
        address wstETH;
        address gateway;
        address receiver;
    }

    /**
     * @notice The structure that stores the deposit token's (stETH) data for the Base bridge.
     * @param wstETH The address of wrapped deposit token on Ethereum.
     * @param remoteWstETH The address of the bridged wrapped deposit token on Base.
     * @param bridge The address of Lido's own "L1ERC20TokenBridge" -- NOT the generic OP Stack
     * `L1StandardBridge`; Base's bridged wstETH is only mintable by Lido's own bridge.
     * @param receiver The address of wrapped token's receiver on Base.
     */
    struct BaseBridgeConfig {
        address wstETH;
        address remoteWstETH;
        address bridge;
        address receiver;
    }

    /**
     * @notice The structure that stores the reward token's (MOR) data.
     * @param gateway The address of token's gateway.
     * @param receiver The address of token's receiver on L2.
     * @param receiverChainId The chain id of receiver.
     * @param zroPaymentAddress The address of ZKSync payment contract.
     * @param adapterParams The parameters for the adapter.
     * @dev LayerZero V1. Retired — superseded by `LayerZeroV2Config`/`lzV2Configs`. The setter
     * (`setLayerZeroConfig`) was removed; the storage slot lives on as `unusedStorage0` on
     * `L1SenderV3`. Kept here only so the historical `LayerZeroConfigSet` event stays decodable.
     */
    struct LayerZeroConfig {
        address gateway;
        address receiver;
        uint16 receiverChainId;
        address zroPaymentAddress;
        bytes adapterParams;
    }

    /**
     * @notice The structure that stores the LayerZero V2 config for one destination network.
     * `lzV2Configs` is keyed by the real EVM chain id (e.g. `42161` for Arbitrum, `8453` for Base) --
     * `eid` is where that resolves to on the LayerZero side; callers never need to know LZ eids.
     * @param eid The LayerZero V2 destination endpoint id for this chain.
     * @param receiver The `L2MessageReceiverV2` address on the destination network, as `bytes32`
     * (see `OAppCore.peers`/`setPeer` — left-padded address).
     * @param options The LayerZero V2 execution options for the destination (replaces the V1
     * `adapterParams`).
     */
    struct LayerZeroV2Config {
        uint32 eid;
        bytes32 receiver;
        bytes options;
    }

    /**
     * @notice The function to receive the stETH contract address.
     * @return The stETH contract address.
     */
    function stETH() external view returns (address);

    /**
     * @notice The function to receive the `Distributor` contract address.
     * @return The `Distributor` contract address.
     */
    function distributor() external view returns (address);

    /**
     * @notice The function to receive the Uniswap `SwapRouter` contract address.
     * @return The Uniswap `SwapRouter` contract address.
     */
    function uniswapSwapRouter() external view returns (address);

    /**
     * @notice The function to receive the LayerZero V2 endpoint address.
     * @dev See https://docs.layerzero.network/v2/deployments/deployed-contracts for the `EndpointV2`
     * address on each chain.
     * @return The LayerZero V2 endpoint address.
     */
    function lzEndpointV2() external view returns (address);

    /**
     * @notice The function to receive the default destination chain id (real EVM chain id, e.g.
     * `42161` for Arbitrum), used by `sendMintMessage(address,uint256,address)` (the legacy
     * 3-argument signature).
     * @return The default destination chain id.
     */
    function defaultChainId() external view returns (uint32);

    /**
     * @notice The function to set the stETH address
     * @dev Only for the contract `owner()`.
     * @param value_ stETH contract address
     */
    function setStETh(address value_) external;

    /**
     * @notice The function to set the `distributor` value
     * @dev Only for the contract `owner()`.
     * @param value_ stETH contract address
     */
    function setDistributor(address value_) external;

    /**
     * @notice The function to set the `uniswapSwapRouter` value
     * @dev Only for the contract `owner()`.
     * @param value_ `uniswapSwapRouter` contract address
     */
    function setUniswapSwapRouter(address value_) external;

    /**
     * @notice The function to set the LayerZero V2 endpoint address.
     * @dev Only for the contract `owner()`.
     * @param value_ The LayerZero V2 endpoint address.
     */
    function setLzEndpointV2(address value_) external;

    /**
     * @notice The function to set the delegate on the LayerZero V2 endpoint.
     * @dev Only for the contract `owner()`.
     * @param delegate_ The delegate address.
     */
    function setLzDelegate(address delegate_) external;

    /**
     * @notice The function to set the default destination chain id (real EVM chain id, e.g. `42161`
     * for Arbitrum), used by `sendMintMessage(address,uint256,address)` (the legacy 3-argument
     * signature). Must already have a `lzV2Configs` entry.
     * @dev Only for the contract `owner()`.
     * @param chainId_ The default destination chain id.
     */
    function setDefaultChainId(uint32 chainId_) external;

    /**
     * @notice The function to set the LayerZero V2 config for a destination network.
     * @dev Only for the contract `owner()`.
     * @param chainId_ The destination chain id (real EVM chain id, e.g. `42161` for Arbitrum,
     * `8453` for Base) -- NOT the LayerZero endpoint id. `config_.eid` is where that resolves to.
     * @param config_ The config.
     */
    function setLzV2Config(uint32 chainId_, LayerZeroV2Config calldata config_) external;

    /**
     * @notice The function to send the reward token mint message to the `L1SenderV2`.
     * @dev Sends to `defaultChainId`. Equivalent to `sendMintMessage(user_, amount_, refundTo_, defaultChainId())`.
     * @param user_ The user's address receiver .
     * @param amount_ The amount of reward token to mint.
     * @param refundTo_ The address to refund the overpaid gas.
     */
    function sendMintMessage(address user_, uint256 amount_, address refundTo_) external payable;

    /**
     * @notice The function to send the reward token mint message to a `L2MessageReceiverV2` on the
     * specified destination network, via LayerZero V2.
     * @param user_ The user's address receiver.
     * @param amount_ The amount of reward token to mint.
     * @param refundTo_ The address to refund the overpaid gas.
     * @param chainId_ The destination chain id (real EVM chain id, e.g. `42161` for Arbitrum,
     * `8453` for Base) -- NOT the LayerZero endpoint id. See `lzV2Configs`.
     */
    function sendMintMessage(address user_, uint256 amount_, address refundTo_, uint32 chainId_) external payable;

    /**
     * @notice The function to set the Arbitrum Bridge config
     * @dev Only for the contract `owner()`.
     * @param newConfig_ Config
     */
    function setArbitrumBridgeConfig(ArbitrumBridgeConfig calldata newConfig_) external;

    /**
     * @notice The function to send all current balance of the deposit token to the L2.
     * @param gasLimit_ The gas limit for the L2 transaction.
     * @param maxFeePerGas_ The max fee per gas for the L2 transaction.
     * @param maxSubmissionCost_ The max submission cost for the L2 transaction.
     * @return The unique identifier for withdrawal.
     */
    function sendWstETH(
        uint256 gasLimit_,
        uint256 maxFeePerGas_,
        uint256 maxSubmissionCost_
    ) external payable returns (bytes memory);

    /**
     * @notice The function to set the Base bridge config.
     * @dev Only for the contract `owner()`.
     * @param newConfig_ Config
     */
    function setBaseBridgeConfig(BaseBridgeConfig calldata newConfig_) external;

    /**
     * @notice The function to send wstETH to Base via Lido's own bridge.
     * @dev Unlike `sendWstETH` (Arbitrum retryable tickets), Lido's bridge doesn't need a prepaid L2
     * gas fee from the sender, so this isn't `payable` and there's no `maxFeePerGas_`/
     * `maxSubmissionCost_` equivalent.
     * @param amount_ The amount of wstETH to send, capped to the post-wrap balance -- if less is
     * available, sends whatever there is instead of reverting. `type(uint256).max` sends everything.
     * @param l2Gas_ The gas limit for the L2 finalization of the deposit.
     * @param extraData_ Extra data forwarded to the bridge.
     */
    function sendWstETHToBase(uint256 amount_, uint32 l2Gas_, bytes calldata extraData_) external;

    /**
     * @notice The function to swap the tokens on the contract.
     * @param tokens_ Token for the swap.
     * @param poolsFee_ Pools fee for the swap.
     * @param amountIn_ Amount IN to swap.
     * @param amountOutMinimum_ Minimal amount OUT to receive.
     * @param deadline_  The unix time after which a swap will fail, to protect against long-pending transactions and wild swings in prices.
     */
    function swapExactInputMultihop(
        address[] calldata tokens_,
        uint24[] calldata poolsFee_,
        uint256 amountIn_,
        uint256 amountOutMinimum_,
        uint256 deadline_
    ) external returns (uint256);

    /**
     * @notice The function to get the contract version.
     * @return The current contract version
     */
    function version() external pure returns (uint256);
}
