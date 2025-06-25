// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import {PRECISION} from "@solarity/solidity-lib/utils/Globals.sol";

import {IDepositPool, IERC165} from "../interfaces/capital-protocol/IDepositPool.sol";
import {IRewardPool} from "../interfaces/capital-protocol/IRewardPool.sol";
import {IDistributor} from "../interfaces/capital-protocol/IDistributor.sol";

import {LockMultiplierMath} from "../libs/LockMultiplierMath.sol";
import {ReferrerLib} from "../libs/ReferrerLib.sol";

contract DepositPool is IDepositPool, OwnableUpgradeable, UUPSUpgradeable {
    using SafeERC20 for IERC20;
    using ReferrerLib for ReferrerData;
    using ReferrerLib for ReferrerTier[];

    uint128 constant DECIMAL = 1e18;

    bool public isNotUpgradeable;

    /** @dev Main stake token for the contract */
    address public depositToken;

    /**
     * @dev `L1SenderV2` contract address
     * v7 update, moved to the `Distributor` contract.
     */
    address public unusedStorage0;

    /**
     * @dev Contain information about reward pools. Removed in `DepositPool`,
     * v6 update, moved to the `RewardPool` contract.
     */
    Pool[] public unusedStorage1;

    /** @dev Contain internal data about the reward pools, necessary for calculations */
    mapping(uint256 => RewardPoolData) public rewardPoolsData;

    /** @dev Contain internal data about the users deposits, necessary for calculations */
    mapping(address => mapping(uint256 => UserData)) public usersData;

    /** @dev Contain total real deposited amount for `depositToken` */
    uint256 public totalDepositedInPublicPools;

    /**
     * @dev UPGRADE. `DistributionV4` storage updates, add pool limits.
     * Removed in `DepositPool`, v6 update, moved to `rewardPoolsProtocolDetails`
     */
    mapping(uint256 => RewardPoolLimits) public unusedStorage2;

    /** @dev UPGRADE `DistributionV5` storage updates, add referrers. */
    mapping(uint256 => ReferrerTier[]) public referrerTiers;
    mapping(address => mapping(uint256 => ReferrerData)) public referrersData;
    /** @dev UPGRADE `DistributionV5` end. */

    /** @dev UPGRADE `DistributionV6` storage updates, add addresses allowed to claim. Add whitelisted claim receivers. */
    mapping(uint256 => mapping(address => mapping(address => bool))) public claimSender;
    mapping(uint256 => mapping(address => address)) public claimReceiver;
    /** @dev UPGRADE `DistributionV6` end. */

    /** @dev UPGRADE `DepositPool`, v7. Storage updates, add few deposit pools. */
    /** @dev This flag determines whether the migration has been completed. */
    bool public isMigrationOver;

    /** @dev `Distributor` contract address. */
    address public distributor;

    /** @dev Contain information about rewards pools needed for this contract. */
    mapping(uint256 => RewardPoolProtocolDetails) public rewardPoolsProtocolDetails;
    /** @dev UPGRADE `DepositPool`, v7 end. */

    /**********************************************************************************************/
    /*** Init, IERC165                                                                          ***/
    /**********************************************************************************************/

    constructor() {
        _disableInitializers();
    }

    function DepositPool_init(address depositToken_, address distributor_) external initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();

        depositToken = depositToken_;
        setDistributor(distributor_);
    }

    function supportsInterface(bytes4 interfaceId_) external pure returns (bool) {
        return interfaceId_ == type(IDepositPool).interfaceId || interfaceId_ == type(IERC165).interfaceId;
    }

    /**********************************************************************************************/
    /*** Global contract management functionality for the contract `owner()`                    ***/
    /**********************************************************************************************/

    function setDistributor(address value_) public onlyOwner {
        require(IERC165(value_).supportsInterface(type(IDistributor).interfaceId), "DR: invalid distributor address");

        if (distributor != address(0)) {
            IERC20(depositToken).approve(distributor, 0);
        }
        IERC20(depositToken).approve(value_, type(uint256).max);

        distributor = value_;

        emit DistributorSet(value_);
    }

    function setRewardPoolProtocolDetails(
        uint256 rewardPoolIndex_,
        uint128 withdrawLockPeriodAfterStake_,
        uint128 claimLockPeriodAfterStake_,
        uint128 claimLockPeriodAfterClaim_,
        uint256 minimalStake_
    ) public onlyOwner {
        RewardPoolProtocolDetails storage rewardPoolProtocolDetails = rewardPoolsProtocolDetails[rewardPoolIndex_];

        rewardPoolProtocolDetails.withdrawLockPeriodAfterStake = withdrawLockPeriodAfterStake_;
        rewardPoolProtocolDetails.claimLockPeriodAfterStake = claimLockPeriodAfterStake_;
        rewardPoolProtocolDetails.claimLockPeriodAfterClaim = claimLockPeriodAfterClaim_;
        rewardPoolProtocolDetails.minimalStake = minimalStake_;

        emit RewardPoolsDataSet(
            rewardPoolIndex_,
            withdrawLockPeriodAfterStake_,
            claimLockPeriodAfterStake_,
            claimLockPeriodAfterClaim_,
            minimalStake_
        );
    }

    function migrate(uint256 rewardPoolIndex_) external onlyOwner {
        require(!isMigrationOver, "DS: the migration is over");
        if (totalDepositedInPublicPools == 0) {
            isMigrationOver = true;
            emit Migrated(rewardPoolIndex_);

            return;
        }

        IRewardPool rewardPool_ = IRewardPool(IDistributor(distributor).rewardPool());
        rewardPool_.onlyExistedRewardPool(rewardPoolIndex_);
        rewardPool_.onlyPublicRewardPool(rewardPoolIndex_);

        // Transfer yield to prevent the reward loss
        uint256 remainder_ = IERC20(depositToken).balanceOf(address(this)) - totalDepositedInPublicPools;
        require(remainder_ > 0, "DS: yield for token is zero");
        IERC20(depositToken).transfer(distributor, remainder_);

        IDistributor(distributor).supply(rewardPoolIndex_, totalDepositedInPublicPools);

        isMigrationOver = true;

        emit Migrated(rewardPoolIndex_);
    }

    function editReferrerTiers(uint256 rewardPoolIndex_, ReferrerTier[] calldata referrerTiers_) external onlyOwner {
        IRewardPool rewardPool_ = IRewardPool(IDistributor(distributor).rewardPool());
        rewardPool_.onlyExistedRewardPool(rewardPoolIndex_);

        delete referrerTiers[rewardPoolIndex_];

        uint256 lastAmount_;
        uint256 lastMultiplier_;
        for (uint256 i = 0; i < referrerTiers_.length; i++) {
            uint256 amount_ = referrerTiers_[i].amount;
            uint256 multiplier_ = referrerTiers_[i].multiplier;

            if (i != 0) {
                require(amount_ > lastAmount_, "DS: invalid referrer tiers (1)");
                require(multiplier_ > lastMultiplier_, "DS: invalid referrer tiers (2)");
            }

            referrerTiers[rewardPoolIndex_].push(referrerTiers_[i]);

            lastAmount_ = amount_;
            lastMultiplier_ = multiplier_;
        }

        emit ReferrerTiersEdited(rewardPoolIndex_, referrerTiers_);
    }

    function manageUsersInPrivateRewardPool(
        uint256 rewardPoolIndex_,
        address[] calldata users_,
        uint256[] calldata amounts_,
        uint128[] calldata claimLockEnds_,
        address[] calldata referrers_
    ) external onlyOwner {
        IRewardPool rewardPool_ = IRewardPool(IDistributor(distributor).rewardPool());
        rewardPool_.onlyExistedRewardPool(rewardPoolIndex_);
        rewardPool_.onlyNotPublicRewardPool(rewardPoolIndex_);

        require(users_.length == amounts_.length, "DS: invalid length");
        require(users_.length == claimLockEnds_.length, "DS: invalid length");
        require(users_.length == referrers_.length, "DS: invalid length");

        IDistributor(distributor).distributeRewards(rewardPoolIndex_);
        (uint256 currentPoolRate_, uint256 rewards_) = _getCurrentPoolRate(rewardPoolIndex_);

        // Update `rewardPoolsProtocolDetails`
        rewardPoolsProtocolDetails[rewardPoolIndex_].distributedRewards += rewards_;

        for (uint256 i; i < users_.length; ++i) {
            uint256 deposited_ = usersData[users_[i]][rewardPoolIndex_].deposited;

            if (deposited_ <= amounts_[i]) {
                _stake(
                    users_[i],
                    rewardPoolIndex_,
                    amounts_[i] - deposited_,
                    currentPoolRate_,
                    claimLockEnds_[i],
                    referrers_[i]
                );
            } else {
                _withdraw(users_[i], rewardPoolIndex_, deposited_ - amounts_[i], currentPoolRate_);
            }
        }
    }

    /**********************************************************************************************/
    /*** Stake, claim, withdraw, lock management                                                ***/
    /**********************************************************************************************/

    function setClaimSender(
        uint256 rewardPoolIndex_,
        address[] calldata senders_,
        bool[] calldata isAllowed_
    ) external {
        IRewardPool(IDistributor(distributor).rewardPool()).onlyExistedRewardPool(rewardPoolIndex_);
        require(senders_.length == isAllowed_.length, "DS: invalid array length");

        for (uint256 i = 0; i < senders_.length; ++i) {
            claimSender[rewardPoolIndex_][_msgSender()][senders_[i]] = isAllowed_[i];

            emit ClaimSenderSet(rewardPoolIndex_, _msgSender(), senders_[i], isAllowed_[i]);
        }
    }

    function setClaimReceiver(uint256 rewardPoolIndex_, address receiver_) external {
        IRewardPool(IDistributor(distributor).rewardPool()).onlyExistedRewardPool(rewardPoolIndex_);

        claimReceiver[rewardPoolIndex_][_msgSender()] = receiver_;

        emit ClaimReceiverSet(rewardPoolIndex_, _msgSender(), receiver_);
    }

    function stake(uint256 rewardPoolIndex_, uint256 amount_, uint128 claimLockEnd_, address referrer_) external {
        IRewardPool rewardPool_ = IRewardPool(IDistributor(distributor).rewardPool());
        rewardPool_.onlyExistedRewardPool(rewardPoolIndex_);
        rewardPool_.onlyPublicRewardPool(rewardPoolIndex_);

        IDistributor(distributor).distributeRewards(rewardPoolIndex_);
        (uint256 currentPoolRate_, uint256 rewards_) = _getCurrentPoolRate(rewardPoolIndex_);

        _stake(_msgSender(), rewardPoolIndex_, amount_, currentPoolRate_, claimLockEnd_, referrer_);

        // Update `rewardPoolsProtocolDetails`
        rewardPoolsProtocolDetails[rewardPoolIndex_].distributedRewards += rewards_;
    }

    function withdraw(uint256 rewardPoolIndex_, uint256 amount_) external {
        IRewardPool rewardPool_ = IRewardPool(IDistributor(distributor).rewardPool());
        rewardPool_.onlyExistedRewardPool(rewardPoolIndex_);
        rewardPool_.onlyPublicRewardPool(rewardPoolIndex_);

        IDistributor(distributor).distributeRewards(rewardPoolIndex_);

        (uint256 currentPoolRate_, uint256 rewards_) = _getCurrentPoolRate(rewardPoolIndex_);

        _withdraw(_msgSender(), rewardPoolIndex_, amount_, currentPoolRate_);

        // Update `rewardPoolsProtocolDetails`
        rewardPoolsProtocolDetails[rewardPoolIndex_].distributedRewards += rewards_;
    }

    function claim(uint256 rewardPoolIndex_, address receiver_) external payable {
        _claim(rewardPoolIndex_, _msgSender(), receiver_);
    }

    function claimFor(uint256 rewardPoolIndex_, address staker_, address receiver_) external payable {
        if (claimReceiver[rewardPoolIndex_][staker_] != address(0)) {
            receiver_ = claimReceiver[rewardPoolIndex_][staker_];
        } else {
            require(claimSender[rewardPoolIndex_][staker_][_msgSender()], "DS: invalid caller");
        }

        _claim(rewardPoolIndex_, staker_, receiver_);
    }

    function claimReferrerTier(uint256 rewardPoolIndex_, address receiver_) external payable {
        _claimReferrerTier(rewardPoolIndex_, _msgSender(), receiver_);
    }

    function claimReferrerTierFor(uint256 rewardPoolIndex_, address referrer_, address receiver_) external payable {
        require(claimSender[rewardPoolIndex_][referrer_][_msgSender()], "DS: invalid caller");

        _claimReferrerTier(rewardPoolIndex_, referrer_, receiver_);
    }

    function lockClaim(uint256 rewardPoolIndex_, uint128 claimLockEnd_) external {
        require(isMigrationOver == true, "DS: migration isn't over");
        IRewardPool(IDistributor(distributor).rewardPool()).onlyExistedRewardPool(rewardPoolIndex_);

        require(claimLockEnd_ > block.timestamp, "DS: invalid lock end value (1)");

        IDistributor(distributor).distributeRewards(rewardPoolIndex_);

        address user_ = _msgSender();
        (uint256 currentPoolRate_, uint256 rewards_) = _getCurrentPoolRate(rewardPoolIndex_);

        RewardPoolData storage rewardPoolData = rewardPoolsData[rewardPoolIndex_];
        UserData storage userData = usersData[user_][rewardPoolIndex_];

        require(userData.deposited > 0, "DS: user isn't staked");
        require(claimLockEnd_ > userData.claimLockEnd, "DS: invalid lock end value (2)");

        userData.pendingRewards = _getCurrentUserReward(currentPoolRate_, userData);

        uint128 claimLockStart_ = userData.claimLockStart > 0 ? userData.claimLockStart : uint128(block.timestamp);
        uint256 multiplier_ = _getUserTotalMultiplier(claimLockStart_, claimLockEnd_, userData.referrer);
        uint256 virtualDeposited_ = (userData.deposited * multiplier_) / PRECISION;

        if (userData.virtualDeposited == 0) {
            userData.virtualDeposited = userData.deposited;
        }

        // Update `rewardPoolData`
        rewardPoolData.lastUpdate = uint128(block.timestamp);
        rewardPoolData.rate = currentPoolRate_;
        rewardPoolData.totalVirtualDeposited =
            rewardPoolData.totalVirtualDeposited +
            virtualDeposited_ -
            userData.virtualDeposited;

        // Update `userData`
        userData.rate = currentPoolRate_;
        userData.virtualDeposited = virtualDeposited_;
        userData.claimLockStart = claimLockStart_;
        userData.claimLockEnd = claimLockEnd_;
        // Update `rewardPoolsProtocolDetails`
        rewardPoolsProtocolDetails[rewardPoolIndex_].distributedRewards += rewards_;

        emit UserClaimLocked(rewardPoolIndex_, user_, claimLockStart_, claimLockEnd_);
    }

    function _stake(
        address user_,
        uint256 rewardPoolIndex_,
        uint256 amount_,
        uint256 currentPoolRate_,
        uint128 claimLockEnd_,
        address referrer_
    ) private {
        require(isMigrationOver == true, "DS: migration isn't over");

        RewardPoolProtocolDetails storage rewardPoolProtocolDetails = rewardPoolsProtocolDetails[rewardPoolIndex_];
        RewardPoolData storage rewardPoolData = rewardPoolsData[rewardPoolIndex_];
        UserData storage userData = usersData[user_][rewardPoolIndex_];

        if (claimLockEnd_ == 0) {
            claimLockEnd_ = userData.claimLockEnd > block.timestamp ? userData.claimLockEnd : uint128(block.timestamp);
        }
        require(claimLockEnd_ >= userData.claimLockEnd, "DS: invalid claim lock end");

        if (referrer_ == address(0)) {
            referrer_ = userData.referrer;
        }

        if (IRewardPool(IDistributor(distributor).rewardPool()).isRewardPoolPublic(rewardPoolIndex_)) {
            require(amount_ > 0, "DS: nothing to stake");

            // https://docs.lido.fi/guides/lido-tokens-integration-guide/#steth-internals-share-mechanics
            uint256 balanceBefore_ = IERC20(depositToken).balanceOf(address(this));
            IERC20(depositToken).safeTransferFrom(_msgSender(), address(this), amount_);
            uint256 balanceAfter_ = IERC20(depositToken).balanceOf(address(this));

            amount_ = balanceAfter_ - balanceBefore_;

            IDistributor(distributor).supply(rewardPoolIndex_, amount_);

            require(userData.deposited + amount_ >= rewardPoolProtocolDetails.minimalStake, "DS: amount too low");

            totalDepositedInPublicPools += amount_;
        }

        userData.pendingRewards = _getCurrentUserReward(currentPoolRate_, userData);

        uint256 deposited_ = userData.deposited + amount_;
        uint256 multiplier_ = _getUserTotalMultiplier(uint128(block.timestamp), claimLockEnd_, referrer_);
        uint256 virtualDeposited_ = (deposited_ * multiplier_) / PRECISION;

        if (userData.virtualDeposited == 0) {
            userData.virtualDeposited = userData.deposited;
        }

        _applyReferrerTier(
            user_,
            rewardPoolIndex_,
            currentPoolRate_,
            userData.deposited,
            deposited_,
            userData.referrer,
            referrer_
        );

        // Update `poolData`
        rewardPoolData.lastUpdate = uint128(block.timestamp);
        rewardPoolData.rate = currentPoolRate_;
        rewardPoolData.totalVirtualDeposited =
            rewardPoolData.totalVirtualDeposited +
            virtualDeposited_ -
            userData.virtualDeposited;

        // Update `userData
        userData.lastStake = uint128(block.timestamp);
        userData.rate = currentPoolRate_;
        userData.deposited = deposited_;
        userData.virtualDeposited = virtualDeposited_;
        userData.claimLockStart = uint128(block.timestamp);
        userData.claimLockEnd = claimLockEnd_;
        userData.referrer = referrer_;

        emit UserStaked(rewardPoolIndex_, user_, amount_);
        emit UserClaimLocked(rewardPoolIndex_, user_, uint128(block.timestamp), claimLockEnd_);
    }

    function _withdraw(address user_, uint256 rewardPoolIndex_, uint256 amount_, uint256 currentPoolRate_) private {
        require(isMigrationOver == true, "DS: migration isn't over");

        RewardPoolProtocolDetails storage rewardPoolProtocolDetails = rewardPoolsProtocolDetails[rewardPoolIndex_];
        RewardPoolData storage rewardPoolData = rewardPoolsData[rewardPoolIndex_];
        UserData storage userData = usersData[user_][rewardPoolIndex_];

        uint256 deposited_ = userData.deposited;
        require(deposited_ > 0, "DS: user isn't staked");

        if (amount_ > deposited_) {
            amount_ = deposited_;
        }

        uint256 newDeposited_;
        if (IRewardPool(IDistributor(distributor).rewardPool()).isRewardPoolPublic(rewardPoolIndex_)) {
            require(
                block.timestamp > userData.lastStake + rewardPoolProtocolDetails.withdrawLockPeriodAfterStake,
                "DS: pool withdraw is locked"
            );

            uint256 depositTokenContractBalance_ = IERC20(depositToken).balanceOf(distributor);
            if (amount_ > depositTokenContractBalance_) {
                amount_ = depositTokenContractBalance_;
            }

            newDeposited_ = deposited_ - amount_;

            require(amount_ > 0, "DS: nothing to withdraw");
            require(
                newDeposited_ >= rewardPoolProtocolDetails.minimalStake ||
                    newDeposited_ == 0 ||
                    depositTokenContractBalance_ == amount_,
                "DS: invalid withdraw amount"
            );
        } else {
            newDeposited_ = deposited_ - amount_;
        }

        userData.pendingRewards = _getCurrentUserReward(currentPoolRate_, userData);

        uint256 multiplier_ = _getUserTotalMultiplier(
            uint128(block.timestamp),
            userData.claimLockEnd,
            userData.referrer
        );
        uint256 virtualDeposited_ = (newDeposited_ * multiplier_) / PRECISION;

        if (userData.virtualDeposited == 0) {
            userData.virtualDeposited = userData.deposited;
        }

        _applyReferrerTier(
            user_,
            rewardPoolIndex_,
            currentPoolRate_,
            deposited_,
            newDeposited_,
            userData.referrer,
            userData.referrer
        );

        // Update pool data
        rewardPoolData.lastUpdate = uint128(block.timestamp);
        rewardPoolData.rate = currentPoolRate_;
        rewardPoolData.totalVirtualDeposited =
            rewardPoolData.totalVirtualDeposited +
            virtualDeposited_ -
            userData.virtualDeposited;

        // Update user data
        userData.rate = currentPoolRate_;
        userData.deposited = newDeposited_;
        userData.virtualDeposited = virtualDeposited_;
        userData.claimLockStart = uint128(block.timestamp);

        if (IRewardPool(IDistributor(distributor).rewardPool()).isRewardPoolPublic(rewardPoolIndex_)) {
            totalDepositedInPublicPools -= amount_;

            IDistributor(distributor).withdraw(rewardPoolIndex_, amount_);
            IERC20(depositToken).safeTransfer(user_, amount_);
        }

        emit UserWithdrawn(rewardPoolIndex_, user_, amount_);
    }

    function _claim(uint256 rewardPoolIndex_, address user_, address receiver_) private {
        require(isMigrationOver == true, "DS: migration isn't over");
        IRewardPool(IDistributor(distributor).rewardPool()).onlyExistedRewardPool(rewardPoolIndex_);

        UserData storage userData = usersData[user_][rewardPoolIndex_];

        require(
            block.timestamp >
                userData.lastStake + rewardPoolsProtocolDetails[rewardPoolIndex_].claimLockPeriodAfterStake,
            "DS: pool claim is locked (S)"
        );
        require(
            block.timestamp >
                userData.lastClaim + rewardPoolsProtocolDetails[rewardPoolIndex_].claimLockPeriodAfterClaim,
            "DS: pool claim is locked (C)"
        );
        require(block.timestamp > userData.claimLockEnd, "DS: user claim is locked");

        IDistributor(distributor).distributeRewards(rewardPoolIndex_);

        (uint256 currentPoolRate_, uint256 rewards_) = _getCurrentPoolRate(rewardPoolIndex_);
        uint256 pendingRewards_ = _getCurrentUserReward(currentPoolRate_, userData);
        require(pendingRewards_ > 0, "DS: nothing to claim");

        uint256 deposited_ = userData.deposited;

        uint256 multiplier_ = _getUserTotalMultiplier(0, 0, userData.referrer);
        uint256 virtualDeposited_ = (deposited_ * multiplier_) / PRECISION;

        if (userData.virtualDeposited == 0) {
            userData.virtualDeposited = userData.deposited;
        }

        // Update `rewardPoolData`
        RewardPoolData storage rewardPoolData = rewardPoolsData[rewardPoolIndex_];
        rewardPoolData.lastUpdate = uint128(block.timestamp);
        rewardPoolData.rate = currentPoolRate_;
        rewardPoolData.totalVirtualDeposited =
            rewardPoolData.totalVirtualDeposited +
            virtualDeposited_ -
            userData.virtualDeposited;

        // Update `userData`
        userData.rate = currentPoolRate_;
        userData.pendingRewards = 0;
        userData.virtualDeposited = virtualDeposited_;
        userData.claimLockStart = 0;
        userData.claimLockEnd = 0;
        userData.lastClaim = uint128(block.timestamp);
        // Update `rewardPoolsProtocolDetails`
        rewardPoolsProtocolDetails[rewardPoolIndex_].distributedRewards += rewards_;

        // Transfer rewards
        IDistributor(distributor).sendMintMessage{value: msg.value}(
            rewardPoolIndex_,
            receiver_,
            pendingRewards_,
            _msgSender()
        );

        emit UserClaimed(rewardPoolIndex_, user_, receiver_, pendingRewards_);
    }

    function _claimReferrerTier(uint256 rewardPoolIndex_, address referrer_, address receiver_) private {
        require(isMigrationOver == true, "DS: migration isn't over");

        IRewardPool(IDistributor(distributor).rewardPool()).onlyExistedRewardPool(rewardPoolIndex_);
        IDistributor(distributor).distributeRewards(rewardPoolIndex_);

        (uint256 currentPoolRate_, uint256 rewards_) = _getCurrentPoolRate(rewardPoolIndex_);

        RewardPoolProtocolDetails storage rewardPoolProtocolDetails = rewardPoolsProtocolDetails[rewardPoolIndex_];
        ReferrerData storage referrerData = referrersData[referrer_][rewardPoolIndex_];

        require(
            block.timestamp > referrerData.lastClaim + rewardPoolProtocolDetails.claimLockPeriodAfterClaim,
            "DS: pool claim is locked (C)"
        );

        uint256 pendingRewards_ = ReferrerLib.claimReferrerTier(referrerData, currentPoolRate_);

        // Update `rewardPoolData`
        RewardPoolData storage rewardPoolData = rewardPoolsData[rewardPoolIndex_];
        rewardPoolData.lastUpdate = uint128(block.timestamp);
        rewardPoolData.rate = currentPoolRate_;

        // Update `rewardPoolsProtocolDetails`
        rewardPoolsProtocolDetails[rewardPoolIndex_].distributedRewards += rewards_;

        // Transfer rewards
        IDistributor(distributor).sendMintMessage{value: msg.value}(
            rewardPoolIndex_,
            receiver_,
            pendingRewards_,
            _msgSender()
        );

        emit ReferrerClaimed(rewardPoolIndex_, referrer_, receiver_, pendingRewards_);
    }

    function _applyReferrerTier(
        address user_,
        uint256 rewardPoolIndex_,
        uint256 currentPoolRate_,
        uint256 oldDeposited_,
        uint256 newDeposited_,
        address oldReferrer_,
        address newReferrer_
    ) private {
        if (newReferrer_ == address(0)) {
            // we assume that referrer can't be removed, only changed
            return;
        }

        ReferrerData storage newReferrerData = referrersData[newReferrer_][rewardPoolIndex_];

        uint256 oldVirtualAmountStaked;
        uint256 newVirtualAmountStaked;

        if (oldReferrer_ == address(0)) {
            oldVirtualAmountStaked = newReferrerData.virtualAmountStaked;

            newReferrerData.applyReferrerTier(referrerTiers[rewardPoolIndex_], 0, newDeposited_, currentPoolRate_);
            newVirtualAmountStaked = newReferrerData.virtualAmountStaked;

            emit UserReferred(rewardPoolIndex_, user_, newReferrer_, newDeposited_);
        } else if (oldReferrer_ == newReferrer_) {
            oldVirtualAmountStaked = newReferrerData.virtualAmountStaked;

            newReferrerData.applyReferrerTier(
                referrerTiers[rewardPoolIndex_],
                oldDeposited_,
                newDeposited_,
                currentPoolRate_
            );
            newVirtualAmountStaked = newReferrerData.virtualAmountStaked;

            emit UserReferred(rewardPoolIndex_, user_, newReferrer_, newDeposited_);
        } else {
            ReferrerData storage oldReferrerData = referrersData[oldReferrer_][rewardPoolIndex_];

            oldVirtualAmountStaked = oldReferrerData.virtualAmountStaked + newReferrerData.virtualAmountStaked;

            oldReferrerData.applyReferrerTier(referrerTiers[rewardPoolIndex_], oldDeposited_, 0, currentPoolRate_);
            newReferrerData.applyReferrerTier(referrerTiers[rewardPoolIndex_], 0, newDeposited_, currentPoolRate_);
            newVirtualAmountStaked = oldReferrerData.virtualAmountStaked + newReferrerData.virtualAmountStaked;

            emit UserReferred(rewardPoolIndex_, user_, oldReferrer_, 0);
            emit UserReferred(rewardPoolIndex_, user_, newReferrer_, newDeposited_);
        }

        RewardPoolData storage rewardPoolData = rewardPoolsData[rewardPoolIndex_];
        rewardPoolData.totalVirtualDeposited =
            rewardPoolData.totalVirtualDeposited +
            newVirtualAmountStaked -
            oldVirtualAmountStaked;
    }

    /**********************************************************************************************/
    /*** Functionality for rewards calculations + getters                                       ***/
    /**********************************************************************************************/

    function getLatestUserReward(uint256 rewardPoolIndex_, address user_) public view returns (uint256) {
        if (!IRewardPool(IDistributor(distributor).rewardPool()).isRewardPoolExist(rewardPoolIndex_)) {
            return 0;
        }

        UserData storage userData = usersData[user_][rewardPoolIndex_];
        (uint256 currentPoolRate_, ) = _getCurrentPoolRate(rewardPoolIndex_);

        return _getCurrentUserReward(currentPoolRate_, userData);
    }

    function getLatestReferrerReward(uint256 rewardPoolIndex_, address user_) public view returns (uint256) {
        if (!IRewardPool(IDistributor(distributor).rewardPool()).isRewardPoolExist(rewardPoolIndex_)) {
            return 0;
        }

        (uint256 currentPoolRate_, ) = _getCurrentPoolRate(rewardPoolIndex_);

        return referrersData[user_][rewardPoolIndex_].getCurrentReferrerReward(currentPoolRate_);
    }

    function _getCurrentUserReward(uint256 currentPoolRate_, UserData memory userData_) private pure returns (uint256) {
        uint256 deposited_ = userData_.virtualDeposited == 0 ? userData_.deposited : userData_.virtualDeposited;

        uint256 newRewards_ = ((currentPoolRate_ - userData_.rate) * deposited_) / PRECISION;

        return userData_.pendingRewards + newRewards_;
    }

    function _getCurrentPoolRate(uint256 rewardPoolIndex_) private view returns (uint256, uint256) {
        RewardPoolData storage rewardPoolData = rewardPoolsData[rewardPoolIndex_];

        uint256 rewards_ = IDistributor(distributor).getDistributedRewards(rewardPoolIndex_, address(this)) -
            rewardPoolsProtocolDetails[rewardPoolIndex_].distributedRewards;

        if (rewardPoolData.totalVirtualDeposited == 0) {
            return (rewardPoolData.rate, rewards_);
        }

        uint256 rate_ = rewardPoolData.rate + (rewards_ * PRECISION) / rewardPoolData.totalVirtualDeposited;

        return (rate_, rewards_);
    }

    /**********************************************************************************************/
    /*** Functionality for multipliers, getters                                                 ***/
    /**********************************************************************************************/

    function getCurrentUserMultiplier(uint256 rewardPoolIndex_, address user_) public view returns (uint256) {
        if (!IRewardPool(IDistributor(distributor).rewardPool()).isRewardPoolExist(rewardPoolIndex_)) {
            return PRECISION;
        }

        UserData storage userData = usersData[user_][rewardPoolIndex_];

        return _getUserTotalMultiplier(userData.claimLockStart, userData.claimLockEnd, userData.referrer);
    }

    function getReferrerMultiplier(uint256 rewardPoolIndex_, address referrer_) public view returns (uint256) {
        if (!IRewardPool(IDistributor(distributor).rewardPool()).isRewardPoolExist(rewardPoolIndex_)) {
            return 0;
        }

        ReferrerData storage referrerData = referrersData[referrer_][rewardPoolIndex_];
        if (referrerData.amountStaked == 0) {
            return 0;
        }

        return (referrerData.virtualAmountStaked * PRECISION) / referrerData.amountStaked;
    }

    function _getUserTotalMultiplier(
        uint128 claimLockStart_,
        uint128 claimLockEnd_,
        address referrer_
    ) internal pure returns (uint256) {
        return
            LockMultiplierMath.getLockPeriodMultiplier(claimLockStart_, claimLockEnd_) +
            ReferrerLib.getReferralMultiplier(referrer_) -
            PRECISION;
    }

    /**********************************************************************************************/
    /*** UUPS                                                                                   ***/
    /**********************************************************************************************/

    function removeUpgradeability() external onlyOwner {
        isNotUpgradeable = true;
    }

    function version() external pure returns (uint256) {
        return 7;
    }

    function _authorizeUpgrade(address) internal view override onlyOwner {
        require(!isNotUpgradeable, "DS: upgrade isn't available");
    }
}
