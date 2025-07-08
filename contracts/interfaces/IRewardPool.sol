// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

/**
 * @title IRewardPool
 * @notice Defines the basic interface for the RewardPool
 */
interface IRewardPool is IERC165 {
    /**
     * @notice The struct that stores the `RewardPool` data.
     * @param payoutStart The timestamp, when calculation start.
     * @param decreaseInterval The decrease interval, seconds. Internal usage.
     * @param initialReward The initial token rewards amount. Internal usage.
     * @param rewardDecrease The amount of tokens. Each `decreaseInterval`, `initialReward` decrease by this amount. Internal usage.
     * @param isPublic True, when the reward pool is public.
     */
    struct RewardPool {
        uint128 payoutStart;
        uint128 decreaseInterval;
        uint256 initialReward;
        uint256 rewardDecrease;
        bool isPublic;
    }

    /**
     * The event that is emitted when the pool is created.
     * @param poolId The pool's id.
     * @param rewardPool The pool's data.
     */
    event RewardPoolAdded(uint256 indexed poolId, RewardPool rewardPool);

    /**
     * @notice The function to add new `RewardPool`.
     * @param rewardPool_ The `RewardPool` details.
     */
    function addRewardPool(RewardPool calldata rewardPool_) external;

    /**
     * @notice The function to check, the reward pool exists or not.
     * @param index_ The reward pool index.
     * @return True, when exists.

     */
    function isRewardPoolExist(uint256 index_) external view returns (bool);

    /**
     * @notice The function to check, the reward pool public or not.
     * @param index_ The reward pool index.
     * @return True, when public.
     */
    function isRewardPoolPublic(uint256 index_) external view returns (bool);

    /**
     * @notice The function to verify that reward pool exists.
     * @param index_ The reward pool index.
     */
    function onlyExistedRewardPool(uint256 index_) external view;

    /**
     * @notice The function to verify that reward pool public.
     * @param index_ The reward pool index.
     */
    function onlyPublicRewardPool(uint256 index_) external view;

    /**
     * @notice The function to verify that reward pool is not public.
     * @param index_ The reward pool index.
     */
    function onlyNotPublicRewardPool(uint256 index_) external view;

    /**
     * @notice The function to calculate potential rewards.
     * @param index_ The reward pool index.
     * @param startTime_  The start timestamp for potential rewards.
     * @param endTime_ The end timestamp for potential rewards.
     */
    function getPeriodRewards(uint256 index_, uint128 startTime_, uint128 endTime_) external view returns (uint256);

    /**
     * @notice The function to get the contract version.
     * @return The current contract version
     */
    function version() external pure returns (uint256);
}
