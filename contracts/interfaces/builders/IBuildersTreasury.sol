// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * This is BuildersTreasury contract that store reward tokens
 */
interface IBuildersTreasury {
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
    function sendReward(address receiver_, uint256 amount_) external;

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
     * The function that returns the total rewards.
     * @dev It calculates the total rewards by adding the balance of the reward token and the distributed rewards.
     * @return The reward amount.
     */
    function getTotalRewards() external view returns (uint256);
}
