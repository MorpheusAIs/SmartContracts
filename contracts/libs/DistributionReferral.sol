// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IDistributionV5} from "../interfaces/IDistributionV5.sol";
import {IL1Sender} from "../interfaces/IL1Sender.sol";

import {ArrayHelper} from "@solarity/solidity-lib/libs/arrays/ArrayHelper.sol";

import {PRECISION} from "@solarity/solidity-lib/utils/Globals.sol";

library DistributionReferral {
    using ArrayHelper for *;

    /**
     * The event that is emitted when the referrer claims rewards.
     * @param poolId The pool's id.
     * @param user The user's address.
     * @param receiver The receiver's address.
     * @param amount The amount of tokens.
     */
    event ReferrerClaimed(uint256 indexed poolId, address indexed user, address receiver, uint256 amount);

    uint256 constant REFERRAL_MULTIPLIER = (PRECISION * 101) / 100; // 1% referral bonus

    function getRefferalMultiplier(address referral_) external pure returns (uint256) {
        if (referral_ == address(0)) {
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

    function applyReferralBonus(
        IDistributionV5.ReferralData storage referralData,
        IDistributionV5.ReferralBonus storage referralBonus,
        IDistributionV5.PoolData storage poolData,
        uint256 oldAmount_,
        uint256 newAmount_,
        uint256 currentPoolRate_
    ) external {
        uint256 newAmountStaked_ = referralData.amountStaked + newAmount_ - oldAmount_;
        uint256 multiplier_ = _getReferrerMultiplier(referralBonus, newAmountStaked_);
        uint256 newVirtualAmountStaked_ = (newAmountStaked_ * multiplier_) / PRECISION;

        poolData.totalVirtualDeposited =
            poolData.totalVirtualDeposited +
            newVirtualAmountStaked_ -
            referralData.virtualAmountStaked;

        referralData.lastStake = uint128(block.timestamp);
        referralData.rate = currentPoolRate_;
        referralData.amountStaked = newAmountStaked_;
        referralData.virtualAmountStaked = newVirtualAmountStaked_;
    }

    function claimReferralBonus(
        IDistributionV5.ReferralData storage referralData,
        IDistributionV5.Pool storage pool,
        IDistributionV5.PoolData storage poolData,
        uint256 poolId_,
        address user_,
        uint256 currentPoolRate_,
        address receiver_
    ) external {
        require(block.timestamp > pool.payoutStart + pool.claimLockPeriod, "DS: pool claim is locked (1)");

        uint256 pendingRewards_ = getCurrentReferrerReward(referralData, currentPoolRate_);
        require(pendingRewards_ > 0, "DS: nothing to claim");

        // Update pool data
        poolData.lastUpdate = uint128(block.timestamp);
        poolData.rate = currentPoolRate_;

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
        IDistributionV5.ReferralBonus storage referralBonus,
        uint256 amount_
    ) internal view returns (uint256) {
        return referralBonus.referrerMultiplier[referralBonus.amountStaked.lowerBound(amount_)];
    }
}
