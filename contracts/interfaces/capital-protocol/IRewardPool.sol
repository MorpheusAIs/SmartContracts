// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

interface IRewardPool is IERC165 {
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

    function addRewardPool(RewardPool calldata rewardPool_) external;

    function isRewardPoolExist(uint256 index_) external view returns (bool);

    function isRewardPoolPublic(uint256 index_) external view returns (bool);

    function onlyExistedRewardPool(uint256 index_) external view;

    function onlyPublicRewardPool(uint256 index_) external view;

    function onlyNotPublicRewardPool(uint256 index_) external view;

    function getPeriodRewards(uint256 index_, uint128 startTime_, uint128 endTime_) external view returns (uint256);

    function version() external pure returns (uint256);
}
