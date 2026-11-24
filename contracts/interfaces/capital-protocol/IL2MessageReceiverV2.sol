// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

/**
 * @title IL2MessageReceiverV2
 * @notice Defines the basic interface for the L2MessageReceiverV2.
 * @dev Receives the reward token mint message from `L1SenderV2` (on Ethereum) via LayerZero V2
 * and mints the reward token to the specified user. One instance is deployed per destination
 * network (Arbitrum, Base, ...); the contract is intentionally not upgradeable, mirroring the
 * `MOROFT` deployment model.
 */
interface IL2MessageReceiverV2 is IERC165 {
    /**
     * @notice The event that is emitted when the `rewardToken` address is set.
     * @param rewardToken The reward token (`MOROFT`) address.
     */
    event RewardTokenSet(address rewardToken);

    /**
     * @notice The event that is emitted when a mint message from `L1SenderV2` is processed.
     * @param srcEid The source endpoint id (Ethereum).
     * @param user The reward receiver address.
     * @param amount The amount of reward token minted.
     */
    event MintMessageReceived(uint32 indexed srcEid, address indexed user, uint256 amount);

    /**
     * @notice The function to receive the reward token (`MOROFT`) address.
     * @return The reward token address.
     */
    function rewardToken() external view returns (address);

    /**
     * @notice The function to set the reward token (`MOROFT`) address.
     * @dev Only for the contract `owner()`.
     * @param value_ The reward token address.
     */
    function setRewardToken(address value_) external;
}
