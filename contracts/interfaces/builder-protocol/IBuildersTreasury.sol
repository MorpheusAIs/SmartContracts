// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

/**
 * This is BuildersTreasury contract that store reward tokens
 */
interface IBuildersTreasury is IERC165 {
    /**
     * The event that is emitted when the builders address is set.
     * @param builders The address of the builders.
     */
    event BuildersSet(address builders);

    /**
     * The event that is emitted when the reward is sent.
     * @param receiver The address of the receiver.
     * @param amount The amount of the reward.
     */
    event RewardSent(address receiver, uint256 amount);

    /**
     * The function that sets the builders address.
     * @param builders_ The address of the builders.
     */
    function setBuilders(address builders_) external;

    /**
     * The function that sends the reward to the receiver.
     * @param receiver_ The address of the receiver.
     * @param amount_ The amount of the reward.
     */
    function sendRewards(address receiver_, uint256 amount_) external;

    /**
     * The function that returns the reward token address.
     * @return The address of the reward token.
     */
    function rewardToken() external view returns (address);

    /**
     * The function that returns the builders address.
     * @return The address of the builders.
     */
    function builders() external view returns (address);

    /**
     * The function that returns all rewards.
     * @dev It calculates the total rewards by adding the balance of the reward token and the distributed rewards.
     * @return The reward amount.
     */
    function getAllRewards() external view returns (uint256);
}
