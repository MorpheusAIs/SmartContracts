// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {PRECISION} from "@solarity/solidity-lib/utils/Globals.sol";

import {LogExpMath} from "./LogExpMath.sol";

/**
 * This is the library that calculates the lock period multiplier.
 */
library LockMultiplierMath {
    uint128 constant DECIMAL = 1e18;

    function getLockPeriodMultiplier(uint128 start_, uint128 end_) external pure returns (uint256) {
        uint256 powerMax = 16_613_275_460_000_000_000; // 16.61327546 * DECIMAL

        uint256 maximalMultiplier_ = 10_700_000_000_000_000_000; // 10.7 * DECIMAL
        uint256 minimalMultiplier_ = DECIMAL; // 1 * DECIMAL

        uint128 periodStart_ = 1721908800; // Thu, 25 Jul 2024 12:00:00 UTC
        uint128 periodEnd_ = 2211192000; // Thu, 26 Jan 2040 12:00:00 UTC
        uint128 distributionPeriod = periodEnd_ - periodStart_;

        end_ = end_ > periodEnd_ ? periodEnd_ : end_;
        start_ = start_ < periodStart_ ? periodStart_ : start_;

        if (start_ >= end_) {
            return PRECISION;
        }

        uint256 endPower_ = _tanh(2 * (((end_ - periodStart_) * DECIMAL) / distributionPeriod));
        uint256 startPower_ = _tanh(2 * (((start_ - periodStart_) * DECIMAL) / distributionPeriod));
        uint256 multiplier_ = (powerMax * (endPower_ - startPower_)) / DECIMAL;

        multiplier_ = multiplier_ > maximalMultiplier_ ? maximalMultiplier_ : multiplier_;
        multiplier_ = multiplier_ < minimalMultiplier_ ? minimalMultiplier_ : multiplier_;

        return (multiplier_ * PRECISION) / DECIMAL;
    }

    /**
     * @dev tahn(x) = (e^x - e^(-x)) / (e^x + e^(-x))
     */
    function _tanh(uint128 x_) private pure returns (uint256) {
        int256 exp_x_ = LogExpMath.exp(int128(x_));
        int256 exp_minus_x = LogExpMath.exp(-int128(x_));

        return uint256(((exp_x_ - exp_minus_x) * int128(DECIMAL)) / (exp_x_ + exp_minus_x));
    }
}
