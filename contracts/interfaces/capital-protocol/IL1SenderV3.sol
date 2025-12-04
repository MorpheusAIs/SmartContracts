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
    event MessageBridgeConfigSet(MessageBridgeConfig messageBridgeConfig);
    event MintMessageSent(address user, uint256 amount);
    event TokenBridgeConfigSet(TokenBridgeConfig tokenBridgeConfig);
    event TokenSent(uint256 amount, address receiver, uint32 l2Gas, bytes data);
    event TokensSwapped(bytes path, uint256 amountIn, uint256 amountOut);

    /**
     * @notice The structure that stores the deposit token's (stETH) data.
     * @param wstETH The address of wrapped deposit token.
     * @param gateway The address of token's gateway.
     * @param receiver The address of wrapped token's receiver on L2.
     */
    struct TokenBridgeConfig {
        address wstETH;
        address gateway;
        address receiver;
    }

    /**
     * @notice The structure that stores the reward token's (MOR) data.
     * @param gateway The address of token's gateway.
     * @param receiver The address of token's receiver on L2.
     * @param receiverChainId The chain id of receiver.
     * @param zroPaymentAddress The address of ZKSync payment contract.
     * @param adapterParams The parameters for the adapter.
     */
    struct MessageBridgeConfig {
        address gateway;
        address receiver;
        uint16 receiverChainId;
        address zroPaymentAddress;
        bytes adapterParams;
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
     * @notice The function to set the LayerZero config
     * @dev Only for the contract `owner()`.
     * @param config_ Config
     */
    function setMessageBridgeConfig(MessageBridgeConfig calldata config_) external;

    /**
     * @notice The function to send the reward token mint message to the `L1SenderV2`.
     * @param user_ The user's address receiver .
     * @param amount_ The amount of reward token to mint.
     * @param refundTo_ The address to refund the overpaid gas.
     */
    function sendMintMessage(address user_, uint256 amount_, address refundTo_) external payable;

    /**
     * @notice The function to set the token bridge config for wstETH transfer to L2
     * @dev Only for the contract `owner()`.
     * @param config_ Config
     */
    function setTokenBridgeConfig(TokenBridgeConfig calldata config_) external;

    /**
     * @notice The function to send all current balance of the deposit token to the L2.
     * @param l2Gas_ Gas limit required to complete the deposit on L2.
     * @param data_ Optional data to forward to L2. This data is provided
     * solely as a convenience for external contracts. Aside from enforcing a maximum
     * length, these contracts provide no guarantees about its content.
     */
    function sendWstETH(uint32 l2Gas_, bytes calldata data_) external;

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
