// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import {PRECISION} from "@solarity/solidity-lib/utils/Globals.sol";

import {IFeeConfig} from "../interfaces/IFeeConfig.sol";
import {IBuilders} from "../interfaces/builders/IBuilders.sol";
import {IBuildersTreasury} from "../interfaces/builders/IBuildersTreasury.sol";

import {LockMultiplierMath} from "../libs/LockMultiplierMath.sol";

contract Builders is IBuilders, UUPSUpgradeable, OwnableUpgradeable {
    using SafeERC20 for IERC20;

    bool public isNotUpgradeable;

    address public feeConfig;
    address public buildersTreasury;

    address public depositToken;

    uint128 public editPoolDeadline;
    uint256 public minimalWithdrawLockPeriod;

    BuilderPool[] public builderPools;
    BuilderPoolData public builderPoolData;

    mapping(uint256 => BuilderData) public buildersData;
    mapping(address => mapping(uint256 => UserData)) public usersData;

    modifier poolExists(uint256 builderPoolId_) {
        require(_poolExists(builderPoolId_), "BU: pool doesn't exist");
        _;
    }

    constructor() {
        _disableInitializers();
    }

    function Builders_init(address depositToken_, address feeConfig_, address buildersTreasury_) external initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();

        setFeeConfig(feeConfig_);
        setBuildersTreasury(buildersTreasury_);
        depositToken = depositToken_;
    }

    function setFeeConfig(address feeConfig_) public onlyOwner {
        require(feeConfig_ != address(0), "BU: invalid fee config");

        feeConfig = feeConfig_;
    }

    function setBuildersTreasury(address buildersTreasury_) public onlyOwner {
        require(buildersTreasury_ != address(0), "BU: invalid builders treasury");

        buildersTreasury = buildersTreasury_;
    }

    function createBuilderPool(BuilderPool calldata builderPool_) public {
        _validateBuilderPool(builderPool_);

        require(builderPool_.poolStart > block.timestamp, "BU: invalid pool start value");
        uint256 builderPoolId_ = builderPools.length;

        builderPools.push(builderPool_);

        emit BuilderPoolCreated(builderPoolId_, builderPool_);
    }

    function editBuilderPool(
        uint256 builderPoolId_,
        BuilderPool calldata builderPool_
    ) external poolExists(builderPoolId_) {
        _validateBuilderPool(builderPool_);

        BuilderPool storage builderPool = builderPools[builderPoolId_];

        require(_msgSender() == builderPool.admin, "BU: only admin can edit pool");

        uint256 poolStart_ = builderPool.poolStart;
        require(block.timestamp < poolStart_ + editPoolDeadline, "BU: pool edit deadline is over");
        require(builderPool_.poolStart >= poolStart_, "BU: invalid pool start value");

        builderPools[builderPoolId_] = builderPool_;

        emit BuilderPoolEdited(builderPoolId_, builderPool_);
    }

    function deposit(uint256 builderPoolId_, uint256 amount_) external poolExists(builderPoolId_) {
        require(amount_ > 0, "BU: nothing to deposit");

        address user_ = _msgSender();

        BuilderPool storage pool = builderPools[builderPoolId_];
        require(block.timestamp >= pool.poolStart, "BU: pool isn't started");

        BuilderData storage builderData = buildersData[builderPoolId_];
        UserData storage userData = usersData[user_][builderPoolId_];

        uint256 deposited_ = userData.deposited + amount_;
        require(deposited_ >= pool.minimalDeposit, "BU: amount too low");

        IERC20(depositToken).safeTransferFrom(_msgSender(), address(this), amount_);

        uint256 currentRate_ = _getCurrentRate();

        builderData.pendingRewards = _getCurrentBuilderReward(currentRate_, builderData);

        // TODO: We can whether calculate dynamically or store the field in the userData
        uint256 previousVirtualDeposited_ = (userData.deposited * getCurrentUserMultiplier(builderPoolId_, user_)) /
            PRECISION;
        uint256 multiplier_ = LockMultiplierMath._getLockPeriodMultiplier(uint128(block.timestamp), pool.claimLockEnd);
        uint256 virtualDeposited_ = (deposited_ * multiplier_) / PRECISION;

        // Update pool data
        builderPoolData.rewardsAtLastUpdate += getNewRewardFromLastUpdate();
        builderPoolData.rate = currentRate_;
        builderPoolData.totalVirtualDeposited =
            builderPoolData.totalVirtualDeposited +
            virtualDeposited_ -
            previousVirtualDeposited_;

        // Update builder data
        builderData.rate = currentRate_;
        builderData.virtualDeposited = builderData.virtualDeposited + virtualDeposited_ - previousVirtualDeposited_;

        // Update user data
        userData.lastDeposit = uint128(block.timestamp);
        userData.deposited = deposited_;
        userData.multiplierLockStart = uint128(block.timestamp);

        emit UserDeposited(builderPoolId_, user_, amount_);
        emit UserLocked(builderPoolId_, user_, uint128(block.timestamp), pool.claimLockEnd);
    }

    function withdraw(uint256 builderPoolId_, uint256 amount_) external poolExists(builderPoolId_) {
        require(amount_ > 0, "BU: nothing to withdraw");

        address user_ = _msgSender();

        BuilderPool storage pool = builderPools[builderPoolId_];
        BuilderData storage builderData = buildersData[builderPoolId_];
        UserData storage userData = usersData[user_][builderPoolId_];

        require(
            block.timestamp > userData.lastDeposit + pool.withdrawLockPeriodAfterDeposit,
            "BU: user withdraw is locked"
        );

        uint256 deposited_ = userData.deposited;
        if (amount_ > deposited_) {
            amount_ = deposited_;
        }

        uint256 newDeposited_ = deposited_ - amount_;

        require(newDeposited_ >= pool.minimalDeposit || newDeposited_ == 0, "BU: invalid withdraw amount");

        uint256 amountToWithdraw_ = _payFee(amount_, "withdraw");
        IERC20(depositToken).safeTransfer(user_, amountToWithdraw_);

        uint256 currentRate_ = _getCurrentRate();

        builderData.pendingRewards = _getCurrentBuilderReward(currentRate_, builderData);

        uint256 previousVirtualDeposited_ = (userData.deposited * getCurrentUserMultiplier(builderPoolId_, user_)) /
            PRECISION;
        uint256 multiplier_ = LockMultiplierMath._getLockPeriodMultiplier(uint128(block.timestamp), pool.claimLockEnd);
        uint256 virtualDeposited_ = (newDeposited_ * multiplier_) / PRECISION;

        // Update pool data
        builderPoolData.rewardsAtLastUpdate += getNewRewardFromLastUpdate();
        builderPoolData.rate = currentRate_;
        builderPoolData.totalVirtualDeposited =
            builderPoolData.totalVirtualDeposited +
            virtualDeposited_ -
            previousVirtualDeposited_;

        // Update builder data
        builderData.rate = currentRate_;
        builderData.virtualDeposited = builderData.virtualDeposited + virtualDeposited_ - previousVirtualDeposited_;

        // Update user data
        userData.deposited = newDeposited_;
        userData.multiplierLockStart = uint128(block.timestamp);

        emit UserWithdrawn(builderPoolId_, user_, amountToWithdraw_);
        emit UserLocked(builderPoolId_, user_, uint128(block.timestamp), pool.claimLockEnd);
    }

    function claim(uint256 builderPoolId_, address receiver_) external poolExists(builderPoolId_) {
        require(_msgSender() == builderPools[builderPoolId_].admin, "BU: only admin can claim rewards");

        BuilderData storage builderData = buildersData[builderPoolId_];

        uint256 currentRate_ = _getCurrentRate();
        uint256 pendingRewards_ = _getCurrentBuilderReward(currentRate_, builderData);
        require(pendingRewards_ > 0, "BU: nothing to claim");

        // Update pool data
        builderPoolData.rewardsAtLastUpdate += getNewRewardFromLastUpdate();
        builderPoolData.rate = currentRate_;

        // Update builder data
        builderData.rate = currentRate_;
        builderData.pendingRewards = 0;

        // Transfer rewards
        uint256 amountToClaim_ = _payFee(pendingRewards_, "claim");
        IBuildersTreasury(buildersTreasury).sendReward(receiver_, amountToClaim_);

        emit AdminClaimed(builderPoolId_, receiver_, amountToClaim_);
    }

    function removeUpgradeability() external onlyOwner {
        isNotUpgradeable = true;
    }

    function getNewRewardFromLastUpdate() public view returns (uint256) {
        return IBuildersTreasury(buildersTreasury).getTotalRewards() - builderPoolData.rewardsAtLastUpdate;
    }

    function getLockPeriodMultiplier(
        uint256 builderPoolId_,
        uint128 lockStart_,
        uint128 lockEnd_
    ) public view returns (uint256) {
        if (!_poolExists(builderPoolId_)) {
            return PRECISION;
        }

        return LockMultiplierMath._getLockPeriodMultiplier(lockStart_, lockEnd_);
    }

    function getCurrentUserMultiplier(uint256 builderPoolId_, address user_) public view returns (uint256) {
        if (!_poolExists(builderPoolId_)) {
            return PRECISION;
        }

        BuilderPool storage pool = builderPools[builderPoolId_];
        UserData storage userData = usersData[user_][builderPoolId_];

        return LockMultiplierMath._getLockPeriodMultiplier(userData.multiplierLockStart, pool.claimLockEnd);
    }

    function getCurrentBuilderReward(uint256 builderPoolId_) external view returns (uint256) {
        if (!_poolExists(builderPoolId_)) {
            return 0;
        }

        return _getCurrentBuilderReward(_getCurrentRate(), buildersData[builderPoolId_]);
    }

    function _validateBuilderPool(BuilderPool calldata builderPool_) internal view {
        require(bytes(builderPool_.name).length != 0, "BU: invalid project name");
        require(builderPool_.admin != address(0), "BU: invalid admin address");
        require(builderPool_.withdrawLockPeriodAfterDeposit >= minimalWithdrawLockPeriod, "BU: invalid withdraw lock");
        require(builderPool_.poolStart > block.timestamp, "BU: invalid pool start value");
    }

    function _payFee(uint256 amount_, string memory operation_) internal returns (uint256) {
        (uint256 feePart_, address treasuryAddress_) = IFeeConfig(feeConfig).getFeeAndTreasuryForOperation(
            address(this),
            operation_
        );

        uint256 fee_ = (amount_ * feePart_) / PRECISION;
        if (fee_ == 0) {
            return amount_;
        }

        IERC20(depositToken).safeTransfer(treasuryAddress_, fee_);

        emit FeePaid(_msgSender(), operation_, fee_, treasuryAddress_);

        return amount_ - fee_;
    }

    function _getCurrentRate() private view returns (uint256) {
        if (builderPoolData.totalVirtualDeposited == 0) {
            return builderPoolData.rate;
        }

        uint256 rewards_ = getNewRewardFromLastUpdate();

        return builderPoolData.rate + (rewards_ * PRECISION) / builderPoolData.totalVirtualDeposited;
    }

    function _getCurrentBuilderReward(
        uint256 currentRate_,
        BuilderData memory builderData_
    ) internal pure returns (uint256) {
        uint256 newRewards_ = ((currentRate_ - builderData_.rate) * builderData_.virtualDeposited) / PRECISION;

        return builderData_.pendingRewards + newRewards_;
    }

    function _poolExists(uint256 builderPoolId_) private view returns (bool) {
        return builderPoolId_ < builderPools.length;
    }

    function _authorizeUpgrade(address) internal view override onlyOwner {
        require(!isNotUpgradeable, "BU: upgrade isn't available");
    }
}
