// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {PRECISION} from "@solarity/solidity-lib/utils/Globals.sol";

import {IDistributionV5} from "../interfaces/IDistributionV5.sol";

library ReferrerLib {
    uint256 constant REFERRAL_MULTIPLIER = (PRECISION * 101) / 100; // 1% referral bonus

    function getReferralMultiplier(address referrer_) external pure returns (uint256) {
        if (referrer_ == address(0)) {
            return PRECISION;
        }

        return REFERRAL_MULTIPLIER;
    }

    function getCurrentReferrerReward(
        IDistributionV5.ReferrerData storage referrerData,
        uint256 currentPoolRate_
    ) public view returns (uint256) {
        uint256 newRewards_ = ((currentPoolRate_ - referrerData.rate) * referrerData.virtualAmountStaked) / PRECISION;

        return referrerData.pendingRewards + newRewards_;
    }

    function applyReferrerTier(
        IDistributionV5.ReferrerData storage referrerData,
        IDistributionV5.ReferrerTier[] storage referrerTiers,
        uint256 oldAmount_,
        uint256 newAmount_,
        uint256 currentPoolRate_
    ) external {
        uint256 newAmountStaked_ = referrerData.amountStaked + newAmount_ - oldAmount_;
        uint256 multiplier_ = _getReferrerMultiplier(referrerTiers, newAmountStaked_);
        uint256 newVirtualAmountStaked_ = (newAmountStaked_ * multiplier_) / PRECISION;

        referrerData.pendingRewards = getCurrentReferrerReward(referrerData, currentPoolRate_);
        referrerData.rate = currentPoolRate_;
        referrerData.amountStaked = newAmountStaked_;
        referrerData.virtualAmountStaked = newVirtualAmountStaked_;
    }

    function claimReferrerTier(
        IDistributionV5.ReferrerData storage referrerData,
        uint256 currentPoolRate_
    ) external returns (uint256) {
        uint256 pendingRewards_ = getCurrentReferrerReward(referrerData, currentPoolRate_);
        require(pendingRewards_ > 0, "DS: nothing to claim");

        referrerData.rate = currentPoolRate_;
        referrerData.pendingRewards = 0;
        referrerData.lastClaim = uint128(block.timestamp);

        return pendingRewards_;
    }

    function _getReferrerMultiplier(
        IDistributionV5.ReferrerTier[] storage referrerTiers,
        uint256 amount_
    ) private view returns (uint256) {
        for (uint256 i = referrerTiers.length; i > 0; i--) {
            if (amount_ >= referrerTiers[i - 1].amount) {
                return referrerTiers[i - 1].multiplier;
            }
        }

        return 0;
    }
}
