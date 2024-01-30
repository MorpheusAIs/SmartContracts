// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * This is the library that calculates the reward for the period with linear distribution and interval decrease.
 * Supports the constant reward amount (decreaseAmount_ = 0)
 */
library LinearDistributionIntervalDecrease {
    /**
     * The function to calculate the reward for the period.
     * @param initialAmount_ The initial reward amount.
     * @param decreaseAmount_ The reward decrease amount.
     * @param payoutStart_ The timestamp when the period starts to pay out rewards.
     * @param interval_ The interval in seconds between reward decreases.
     * @param startTime_ The timestamp when the period starts.
     * @param endTime_ The timestamp when the period ends.
     * @return The reward amount.
     */
    function getPeriodReward(
        uint256 initialAmount_,
        uint256 decreaseAmount_,
        uint128 payoutStart_,
        uint128 interval_,
        uint128 startTime_,
        uint128 endTime_
    ) external pure returns (uint256) {
        if (interval_ == 0) {
            return 0;
        }

        // 'startTime_' can't be less than 'payoutStart_'
        if (startTime_ < payoutStart_) {
            startTime_ = payoutStart_;
        }

        uint128 maxEndTime_ = _calculateMaxEndTime(payoutStart_, interval_, initialAmount_, decreaseAmount_);

        if (endTime_ > maxEndTime_) {
            endTime_ = maxEndTime_;
        }

        // Return 0 when calculation 'startTime_' is bigger then 'endTime_'...
        if (startTime_ >= endTime_) {
            return 0;
        }

        // Calculate interval that less then 'interval_' range
        uint256 timePassedBefore_ = startTime_ - payoutStart_;
        if ((timePassedBefore_ / interval_) == ((endTime_ - payoutStart_) / interval_)) {
            uint256 intervalsPassed_ = timePassedBefore_ / interval_;
            uint256 intervalFullReward_ = initialAmount_ - intervalsPassed_ * decreaseAmount_;

            return (intervalFullReward_ * (endTime_ - startTime_)) / interval_;
        }

        // Calculate interval that more then 'interval_' range
        uint256 firstPeriodReward_ = _calculatePartPeriodReward(
            payoutStart_,
            startTime_,
            interval_,
            initialAmount_,
            decreaseAmount_,
            true
        );

        uint256 secondPeriodReward_ = _calculateFullPeriodReward(
            payoutStart_,
            startTime_,
            endTime_,
            interval_,
            initialAmount_,
            decreaseAmount_
        );

        uint256 thirdPeriodReward_ = _calculatePartPeriodReward(
            payoutStart_,
            endTime_,
            interval_,
            initialAmount_,
            decreaseAmount_,
            false
        );

        return firstPeriodReward_ + secondPeriodReward_ + thirdPeriodReward_;
    }

    function _calculateMaxEndTime(
        uint128 payoutStart_,
        uint128 interval_,
        uint256 initialAmount_,
        uint256 decreaseAmount_
    ) private pure returns (uint128) {
        if (decreaseAmount_ == 0) {
            return type(uint128).max;
        }

        uint256 maxIntervals_ = _divideCeil(initialAmount_, decreaseAmount_);

        return uint128(payoutStart_ + maxIntervals_ * interval_);
    }

    function _calculatePartPeriodReward(
        uint128 payoutStart_,
        uint128 startTime_,
        uint128 interval_,
        uint256 initialAmount_,
        uint256 decreaseAmount_,
        bool toEnd_
    ) private pure returns (uint256) {
        uint256 intervalsPassed_ = (startTime_ - payoutStart_) / interval_;
        uint256 decreaseRewardAmount_ = intervalsPassed_ * decreaseAmount_;
        if (decreaseRewardAmount_ >= initialAmount_) {
            return 0;
        }
        uint256 intervalFullReward_ = initialAmount_ - decreaseRewardAmount_;

        uint256 intervalPart_;
        if (toEnd_) {
            intervalPart_ = interval_ * (intervalsPassed_ + 1) + payoutStart_ - startTime_;
        } else {
            intervalPart_ = startTime_ - interval_ * intervalsPassed_ - payoutStart_;
        }

        if (intervalPart_ == interval_) {
            return 0;
        }

        return (intervalFullReward_ * intervalPart_) / interval_;
    }

    function _calculateFullPeriodReward(
        uint128 payoutStart_,
        uint128 startTime_,
        uint128 endTime_,
        uint128 interval_,
        uint256 initialAmount_,
        uint256 decreaseAmount_
    ) private pure returns (uint256) {
        // START calculate initial reward when period start
        uint256 timePassedBefore_ = startTime_ - payoutStart_;
        uint256 intervalsPassedBefore_ = _divideCeil(timePassedBefore_, interval_);

        uint256 decreaseRewardAmount_ = intervalsPassedBefore_ * decreaseAmount_;

        if (decreaseRewardAmount_ >= initialAmount_) {
            return 0;
        }

        uint256 initialReward_ = initialAmount_ - decreaseRewardAmount_;
        // END

        // Intervals passed
        uint256 ip_ = ((endTime_ - payoutStart_ - intervalsPassedBefore_ * interval_) / interval_);
        if (ip_ == 0) {
            return 0;
        }

        return initialReward_ * ip_ - (decreaseAmount_ * (ip_ * (ip_ - 1))) / 2;
    }

    function _divideCeil(uint256 a_, uint256 b_) private pure returns (uint256) {
        return (a_ + b_ - 1) / b_;
    }
}
