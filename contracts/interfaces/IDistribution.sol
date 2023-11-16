// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

interface IDistribution {
    struct Pool {
        uint128 payoutStart;
        uint128 decreaseInterval;
        uint128 withdrawLockPeriod;
        bool isPublic;
        uint256 initialReward;
        uint256 rewardDecrease;
        uint256 minimalStake;
    }

    struct PoolData {
        uint128 lastUpdate;
        uint256 rate;
        uint256 totalInvested;
    }

    struct UserData {
        uint256 invested;
        uint256 rate;
        uint256 pendingRewards;
    }

    event Staked(
        address user,
        uint256 poolId,
        uint256 amount,
        uint256 userStakeTotal,
        bool isStaked
    );

    function Distribution_init(
        address rewardToken_,
        address investToken_,
        address swap_,
        Pool[] calldata poolsInfo_
    ) external;
}
