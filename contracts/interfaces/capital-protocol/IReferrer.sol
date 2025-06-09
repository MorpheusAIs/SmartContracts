// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IReferrer
 * @notice Defines the basic interface for the IDepositPool and IDistributor
 */
interface IReferrer {
    /**
     * @notice The structure that stores the information about referrer tier.
     * @param amount The minimal token amount for the tier.
     * @param multiplier The multiplier for the tier, where 1% = 0.01 * 10^25.
     */
    struct ReferrerTier {
        uint256 amount;
        uint256 multiplier;
    }

    /**
     * @notice The structure that stores the information about the referrer.
     * @param amountStaked The amount of tokens deposited by user.
     * @param virtualAmountStaked The amount of tokens deposited in the pool with the power factor.
     * @param rate The current reward rate. Used for internal calculations.
     * @param pendingRewards Number of rewards accrued to the user. Is not the final reward at a given time. Used for internal calculations.
     * @param lastClaim A timestamp of the last time the user call the `claim()`.
     */
    struct ReferrerData {
        uint256 amountStaked;
        uint256 virtualAmountStaked;
        uint256 rate;
        uint256 pendingRewards;
        uint128 lastClaim;
    }
}
