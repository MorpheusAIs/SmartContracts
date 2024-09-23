// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {PRECISION} from "@solarity/solidity-lib/utils/Globals.sol";

import {IDistributionV5} from "../interfaces/IDistributionV5.sol";
import {IL1Sender} from "../interfaces/IL1Sender.sol";

library ReferralLib {
    /**
     * The event that is emitted when the referrer claims rewards.
     * @param poolId The pool's id.
     * @param user The user's address.
     * @param receiver The receiver's address.
     * @param amount The amount of tokens.
     */
    event ReferrerClaimed(uint256 indexed poolId, address indexed user, address receiver, uint256 amount);

    uint256 constant REFERRAL_MULTIPLIER = (PRECISION * 101) / 100; // 1% referral bonus

    function getReferralMultiplier(address referrer_) external pure returns (uint256) {
        if (referrer_ == address(0)) {
            return PRECISION;
        }

        return REFERRAL_MULTIPLIER;
    }

    function getCurrentReferrerReward(
        IDistributionV5.ReferralData memory referralData_,
        uint256 currentPoolRate_
    ) public pure returns (uint256) {
        uint256 newRewards_ = ((currentPoolRate_ - referralData_.rate) * referralData_.virtualAmountStaked) / PRECISION;

        return referralData_.pendingRewards + newRewards_;
    }

    function applyReferralTier(
        IDistributionV5.ReferralData storage referralData,
        IDistributionV5.ReferralTier[] storage referralTiers,
        uint256 oldAmount_,
        uint256 newAmount_,
        uint256 currentPoolRate_
    ) external {
        uint256 newAmountStaked_ = referralData.amountStaked + newAmount_ - oldAmount_;
        uint256 multiplier_ = _getReferrerMultiplier(referralTiers, newAmountStaked_);
        uint256 newVirtualAmountStaked_ = (newAmountStaked_ * multiplier_) / PRECISION;

        referralData.lastStake = uint128(block.timestamp);
        referralData.rate = currentPoolRate_;
        referralData.amountStaked = newAmountStaked_;
        referralData.virtualAmountStaked = newVirtualAmountStaked_;
    }

    function claimReferralTier(
        IDistributionV5.ReferralData storage referralData,
        IDistributionV5.Pool storage pool,
        uint256 poolId_,
        address user_,
        uint256 currentPoolRate_,
        address receiver_
    ) external {
        require(block.timestamp > pool.payoutStart + pool.claimLockPeriod, "DS: pool claim is locked (1)");

        uint256 pendingRewards_ = getCurrentReferrerReward(referralData, currentPoolRate_);
        require(pendingRewards_ > 0, "DS: nothing to claim");

        // Update user data
        referralData.rate = currentPoolRate_;
        referralData.pendingRewards = 0;

        // Transfer rewards
        IL1Sender(IDistributionV5(address(this)).l1Sender()).sendMintMessage{value: msg.value}(
            receiver_,
            pendingRewards_,
            user_
        );

        emit ReferrerClaimed(poolId_, user_, receiver_, pendingRewards_);
    }

    function _getReferrerMultiplier(
        IDistributionV5.ReferralTier[] storage referralTiers,
        uint256 amount_
    ) internal view returns (uint256) {
        (uint256 low_, uint256 high_) = (0, referralTiers.length);

        if (high_ == 0) {
            return PRECISION;
        }

        while (low_ < high_) {
            uint256 mid_ = Math.average(low_, high_);

            if (referralTiers[mid_].amount > amount_) {
                high_ = mid_;
            } else {
                low_ = mid_ + 1;
            }
        }

        if (high_ == referralTiers.length) {
            high_--;
        }

        return referralTiers[high_].multiplier;
    }
}
