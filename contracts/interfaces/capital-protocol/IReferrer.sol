// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IReferrer {
    struct ReferrerTier {
        uint256 amount;
        uint256 multiplier;
    }

    struct ReferrerData {
        uint256 amountStaked;
        uint256 virtualAmountStaked;
        uint256 rate;
        uint256 pendingRewards;
        uint128 lastClaim;
    }
}
