// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

/**
 * @title IBuildersTreasury
 * @notice Defines the basic interface for the `BuildersTreasury`
 */
interface IBuildersTreasuryV2 is IERC165 {
    /**
     * @notice The event that is emitted when the builders address is set.
     * @param builders The address of the builders.
     */
    event BuildersSet(address builders);

    /**
     * @notice The event that is emitted when the reward is sent.
     * @param receiver The address of the receiver.
     * @param amount The amount of the reward.
     */
    event RewardSent(address receiver, uint256 amount);

    /**
     * @notice The function that returns the reward token address (MOR).
     * @return The address of the reward token (MOR).
     */
    function rewardToken() external view returns (address);

    /**
     * @notice The function that returns the `BuildersV4` contract address.
     * @return The address of the `BuildersV4` contract.
     */
    function builders() external view returns (address);

    /**
     * @notice The function that sets the `BuildersV4` contract address.
     * @dev Only for the contract owner.
     * @param builders_ The address of the `BuildersV4` contract.
     */
    function setBuilders(address builders_) external;

    /**
     * @notice The function to withdraw `rewardToken` from the contract.
     * @dev Only for the contract owner.
     * @param receiver_ The address of the receiver.
     * @param amount_ The amount of the reward.
     */
    function withdraw(address receiver_, uint256 amount_) external;

    /**
     * @notice The function that sends the reward to the receiver.
     * @dev The caller should be a `BuildersV...` contract.
     * @param receiver_ The address of the receiver.
     * @param amount_ The amount of the reward.
     */
    function sendRewards(address receiver_, uint256 amount_) external;
}
