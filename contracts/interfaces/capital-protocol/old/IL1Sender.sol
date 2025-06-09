// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

interface IL1Sender is IERC165 {
    /**
     * The structure that stores the deposit token's data.
     * @param token The address of wrapped deposit token.
     * @param gateway The address of token's gateway.
     * @param receiver The address of wrapped token's receiver on L2.
     */
    struct DepositTokenConfig {
        address token;
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
    struct RewardTokenConfig {
        address gateway;
        address receiver;
        uint16 receiverChainId;
        address zroPaymentAddress;
        bytes adapterParams;
    }

    /**
     * The function to get the deposit token's address.
     */
    function unwrappedDepositToken() external view returns (address);

    /**
     * The function to set the reward token's config.
     * @param newConfig_ The new reward token's config.
     */
    function setRewardTokenConfig(RewardTokenConfig calldata newConfig_) external;

    /**
     * The function to set the deposit token's config.
     * @param newConfig_ The new deposit token's config.
     */
    function setDepositTokenConfig(DepositTokenConfig calldata newConfig_) external;

    /**
     * The function to send all current balance of the deposit token to the L2.
     * @param gasLimit_ The gas limit for the L2 transaction.
     * @param maxFeePerGas_ The max fee per gas for the L2 transaction.
     * @param maxSubmissionCost_ The max submission cost for the L2 transaction.
     * @return The unique identifier for withdrawal.
     */
    function sendDepositToken(
        uint256 gasLimit_,
        uint256 maxFeePerGas_,
        uint256 maxSubmissionCost_
    ) external payable returns (bytes memory);

    /**
     * The function to send the message of mint of reward token to the L2.
     * @param user_ The user's address to mint reward tokens.
     * @param amount_ The amount of reward tokens to mint.
     * @param refundTo_ The address to refund the overpaid gas.
     */
    function sendMintMessage(address user_, uint256 amount_, address refundTo_) external payable;
}
