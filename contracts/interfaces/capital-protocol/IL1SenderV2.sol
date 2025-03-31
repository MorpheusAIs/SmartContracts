// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

interface IL1SenderV2 is IERC165 {
    /**
     * The structure that stores the deposit token's data.
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
     * The structure that stores the reward token's data.
     * @param gateway The address of token's gateway.
     * @param receiver The address of token's receiver on L2.
     * @param receiverChainId The chain id of receiver.
     * @param zroPaymentAddress The address of ZKSync payment contract.
     * @param adapterParams The parameters for the adapter.
     */
    struct LayerZeroConfig {
        address gateway;
        address receiver;
        uint16 receiverChainId;
        address zroPaymentAddress;
        bytes adapterParams;
    }

    event stETHSet(address stETH);
    event DistributorSet(address distributor);
    event UniswapSwapRouterSet(address uniswapSwapRouter);
    event LayerZeroConfigSet(LayerZeroConfig layerZeroConfig);
    event MintMessageSent(address user, uint256 amount);
    event ArbitrumBridgeConfigSet(ArbitrumBridgeConfig arbitrumBridgeConfig);
    event WstETHSent(uint256 amount, uint256 gasLimit, uint256 maxFeePerGas, uint256 maxSubmissionCost, bytes result);
    event TokensSwapped(bytes path, uint256 amountIn, uint256 amountOut);

    /**
     * The function to set the stETH address
     * @param value_ stETH contract address
     */
    function setStETh(address value_) external;

    /**
     * The function to set the `distributor` value
     * @param value_ stETH contract address
     */
    function setDistributor(address value_) external;

    /**
     * The function to set the `uniswapSwapRouter` value
     * @param value_ `uniswapSwapRouter` contract address
     */
    function setUniswapSwapRouter(address value_) external;

    /**
     * The function to set the LayerZero config
     * @param layerZeroConfig_ Config
     */
    function setLayerZeroConfig(LayerZeroConfig calldata layerZeroConfig_) external;

    /**
     * The function to send the message of mint of reward token to the L2.
     * @param user_ The user's address to mint reward tokens.
     * @param amount_ The amount of reward tokens to mint.
     * @param refundTo_ The address to refund the overpaid gas.
     */
    function sendMintMessage(address user_, uint256 amount_, address refundTo_) external payable;

    /**
     * The function to set the Arbitrum Bridge config
     * @param newConfig_ Config
     */
    function setArbitrumBridgeConfig(ArbitrumBridgeConfig calldata newConfig_) external;

    /**
     * The function to send all current balance of the deposit token to the L2.
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
     * The function to swap the tokens on the contract
     * @param tokens_ Token for the swap
     * @param poolsFee_ Pools fee for the swap
     * @param amountIn_ Amount IN to swap
     * @param amountOutMinimum_ Minimal amount OUT to receive
     */
    function swapExactInputMultihop(
        address[] calldata tokens_,
        uint24[] calldata poolsFee_,
        uint256 amountIn_,
        uint256 amountOutMinimum_
    ) external returns (uint256);

    /**
     * The function to get the contract version.
     */
    function version() external pure returns (uint256);
}
