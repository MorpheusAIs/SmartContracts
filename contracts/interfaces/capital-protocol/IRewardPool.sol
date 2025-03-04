// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

interface IRewardPool {
    /**
     * The structure that stores the core pool's data.
     * @param payoutStart The timestamp when the pool starts to pay out rewards.
     * @param decreaseInterval The interval in seconds between reward decreases.
     * @param withdrawLockPeriod The period in seconds when the user can't withdraw his stake.
     * @param withdrawLockPeriodAfterStake The period in seconds when the user can't withdraw his stake after staking.
     * @param claimLockPeriod The period in seconds when the user can't claim his rewards.
     * @param initialReward The initial reward per interval.
     * @param rewardDecrease The reward decrease per interval.
     * @param minimalStake The minimal stake amount.
     * @param isPublic The flag that indicates if the pool is public.
     */
    struct RewardPool {
        uint128 payoutStart;
        uint128 decreaseInterval;
        uint128 withdrawLockPeriod;
        uint128 claimLockPeriod;
        uint128 withdrawLockPeriodAfterStake;
        uint256 initialReward;
        uint256 rewardDecrease;
        uint256 minimalStake;
        bool isPublic;
    }

    /**
     * The event that is emitted when the pool is created.
     * @param poolId The pool's id.
     * @param rewardPool The pool's data.
     */
    event RewardPoolAdded(uint256 indexed poolId, RewardPool rewardPool);

    function rewardPoolExists(uint256 poolId_) external view returns (bool);
}
