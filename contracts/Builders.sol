// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import {PRECISION} from "@solarity/solidity-lib/utils/Globals.sol";

import {IDistributionV2} from "./interfaces/IDistributionV2.sol";
import {IBuilders} from "./interfaces/IBuilders.sol";
import {IFeeConfig} from "./interfaces/IFeeConfig.sol";

import {LogExpMath} from "./libs/LogExpMath.sol";

contract Builders is IBuilders, UUPSUpgradeable, OwnableUpgradeable {
    using SafeERC20 for IERC20;

    uint128 constant DECIMAL = 1e18;

    bool public isNotUpgradeable;

    address public feeConfig;

    address public depositToken;

    BuilderPool[] public builders;
    IDistributionV2.PoolData public poolData;
    mapping(uint256 => BuilderData) public buildersData;
    mapping(address => mapping(uint256 => UserData)) public usersData;

    mapping(address admin => uint256[] builderPoolIds) public adminPools;

    uint256 public totalDeposited;
    uint256 public totalDistributed;

    modifier poolExists(uint256 builderPoolId_) {
        require(_poolExists(builderPoolId_), "BU: pool doesn't exist");
        _;
    }

    constructor() {
        _disableInitializers();
    }

    function Builders_init(address depositToken_, address feeConfig_) external initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();

        setFeeConfig(feeConfig_);
        depositToken = depositToken_;
    }

    function setFeeConfig(address feeConfig_) public onlyOwner {
        require(feeConfig_ != address(0), "BU: invalid fee config address");

        feeConfig = feeConfig_;
    }

    function createBuilderPool(BuilderPool calldata builderPool_) public onlyOwner {
        require(builderPool_.poolStart > block.timestamp, "BU: invalid pool start value");
        require(builderPool_.project != address(0), "BU: invalid project address");
        require(builderPool_.admin != address(0), "BU: invalid admin address");

        uint256 builderPoolId_ = builders.length;

        builders.push(builderPool_);
        adminPools[builderPool_.admin].push(builderPoolId_);

        emit PoolCreated(builderPoolId_, builderPool_);
    }

    function editBuilderPool(
        uint256 builderPoolId_,
        BuilderPool calldata builderPool_
    ) external poolExists(builderPoolId_) {
        require(_msgSender() == builders[builderPoolId_].admin, "BU: only admin can edit pool");

        uint256 currentPoolStart_ = builders[builderPoolId_].poolStart;
        require(block.timestamp < currentPoolStart_, "BU: invalid pool start value");
        require(builderPool_.poolStart > currentPoolStart_, "BU: invalid pool start value");
        require(builderPool_.project == builders[builderPoolId_].project, "BU: invalid project address");
        require(builderPool_.admin == builders[builderPoolId_].admin, "BU: invalid admin address");

        builders[builderPoolId_] = builderPool_;

        emit PoolEdited(builderPoolId_, builderPool_);
    }

    function stake(
        uint256 builderPoolId_,
        uint256 amount_,
        uint128 withdrawLockEnd_
    ) external poolExists(builderPoolId_) {
        address user_ = _msgSender();

        BuilderPool storage pool = builders[builderPoolId_];
        BuilderData storage builderData = buildersData[builderPoolId_];
        UserData storage userData = usersData[user_][builderPoolId_];

        require(block.timestamp >= pool.poolStart, "BU: pool isn't started");

        if (withdrawLockEnd_ == 0) {
            withdrawLockEnd_ = userData.withdrawLockEnd > block.timestamp
                ? userData.withdrawLockEnd
                : uint128(block.timestamp);
        }

        require(amount_ > 0, "BU: nothing to stake");
        require(withdrawLockEnd_ >= userData.withdrawLockEnd, "BU: invalid withdraw lock end");
        require(userData.deposited + amount_ >= pool.minimalStake, "BU: amount too low");

        IERC20(depositToken).safeTransferFrom(_msgSender(), address(this), amount_);

        uint256 currentRate_ = _getCurrentRate();

        builderData.pendingRewards = _getCurrentBuilderReward(currentRate_, builderData);

        uint256 deposited_ = userData.deposited + amount_;
        uint256 multiplier_ = _getWithdrawLockPeriodMultiplier(uint128(block.timestamp), withdrawLockEnd_);
        uint256 virtualDeposited_ = (deposited_ * multiplier_) / PRECISION;

        // Update pool data
        poolData.lastUpdate = uint128(block.timestamp);
        poolData.rate = currentRate_;
        poolData.totalVirtualDeposited =
            poolData.totalVirtualDeposited +
            virtualDeposited_ -
            builderData.virtualDeposited;

        // Update builder data
        builderData.rate = currentRate_;
        builderData.virtualDeposited = builderData.virtualDeposited + virtualDeposited_ - builderData.virtualDeposited;

        // Update user data
        userData.lastStake = uint128(block.timestamp);
        userData.deposited = deposited_;
        userData.withdrawLockStart = uint128(block.timestamp);
        userData.withdrawLockEnd = withdrawLockEnd_;

        totalDeposited += amount_;

        emit UserStaked(builderPoolId_, user_, amount_);
        emit UserWithdrawLocked(builderPoolId_, user_, uint128(block.timestamp), withdrawLockEnd_);
    }

    function withdraw(uint256 builderPoolId_, uint256 amount_) external poolExists(builderPoolId_) {
        address user_ = _msgSender();
        BuilderPool storage pool = builders[builderPoolId_];
        BuilderData storage builderData = buildersData[builderPoolId_];
        UserData storage userData = usersData[user_][builderPoolId_];

        uint256 deposited_ = userData.deposited;

        if (amount_ > deposited_) {
            amount_ = deposited_;
        }
        require(amount_ > 0, "BU: nothing to withdraw");

        require(
            block.timestamp > userData.lastStake + pool.withdrawLockPeriodAfterStake,
            "BU: pool withdraw is locked"
        );
        require(block.timestamp > userData.withdrawLockEnd, "BU: user withdraw is locked");

        uint256 newDeposited_ = deposited_ - amount_;

        require(newDeposited_ >= pool.minimalStake || newDeposited_ == 0, "BU: invalid withdraw amount");

        uint256 amountToWithdraw_ = _payFee(amount_, "withdraw");
        IERC20(depositToken).safeTransfer(user_, amountToWithdraw_);

        uint256 currentRate_ = _getCurrentRate();

        builderData.pendingRewards = _getCurrentBuilderReward(currentRate_, builderData);

        uint256 multiplier_ = _getWithdrawLockPeriodMultiplier(uint128(block.timestamp), userData.withdrawLockEnd);
        uint256 virtualDeposited_ = (newDeposited_ * multiplier_) / PRECISION;

        // Update pool data
        poolData.lastUpdate = uint128(block.timestamp);
        poolData.rate = currentRate_;
        poolData.totalVirtualDeposited =
            poolData.totalVirtualDeposited +
            virtualDeposited_ -
            builderData.virtualDeposited;

        // Update builder data
        builderData.rate = currentRate_;
        builderData.virtualDeposited = builderData.virtualDeposited + virtualDeposited_ - builderData.virtualDeposited;

        // Update user data
        userData.deposited = newDeposited_;
        userData.withdrawLockStart = 0;
        userData.withdrawLockEnd = 0;

        totalDeposited -= amount_;

        emit UserWithdrawn(builderPoolId_, user_, amountToWithdraw_);
    }

    function lockWithdraw(uint256 builderPoolId_, uint128 withdrawLockEnd_) external poolExists(builderPoolId_) {
        require(withdrawLockEnd_ > block.timestamp, "BU: invalid lock end value (1)");

        address user_ = _msgSender();
        uint256 currentRate_ = _getCurrentRate();

        BuilderData storage builderData = buildersData[builderPoolId_];
        UserData storage userData = usersData[user_][builderPoolId_];

        require(userData.deposited > 0, "BU: user isn't staked");
        require(withdrawLockEnd_ > userData.withdrawLockEnd, "BU: invalid lock end value (2)");

        builderData.pendingRewards = _getCurrentBuilderReward(currentRate_, builderData);

        uint128 withdrawLockStart_ = userData.withdrawLockStart > 0
            ? userData.withdrawLockStart
            : uint128(block.timestamp);
        uint256 multiplier_ = _getWithdrawLockPeriodMultiplier(withdrawLockStart_, withdrawLockEnd_);
        uint256 virtualDeposited_ = (userData.deposited * multiplier_) / PRECISION;

        // Update pool data
        poolData.lastUpdate = uint128(block.timestamp);
        poolData.rate = currentRate_;
        poolData.totalVirtualDeposited =
            poolData.totalVirtualDeposited +
            virtualDeposited_ -
            builderData.virtualDeposited;

        // Update builder data
        builderData.rate = currentRate_;
        builderData.virtualDeposited = builderData.virtualDeposited + virtualDeposited_ - builderData.virtualDeposited;

        // Update user data
        userData.withdrawLockStart = withdrawLockStart_;
        userData.withdrawLockEnd = withdrawLockEnd_;

        emit UserWithdrawLocked(builderPoolId_, user_, withdrawLockStart_, withdrawLockEnd_);
    }

    function claim(uint256 builderPoolId_, address receiver_) external poolExists(builderPoolId_) {
        address user_ = _msgSender();

        require(user_ == builders[builderPoolId_].admin, "BU: only admin can claim rewards");

        BuilderData storage builderData = buildersData[builderPoolId_];
        UserData storage userData = usersData[user_][builderPoolId_];

        uint256 currentRate_ = _getCurrentRate();
        uint256 pendingRewards_ = _getCurrentBuilderReward(currentRate_, builderData);
        require(pendingRewards_ > 0, "BU: nothing to claim");

        // Update pool data
        poolData.lastUpdate = uint128(block.timestamp);
        poolData.rate = currentRate_;

        // Update builder data
        builderData.rate = currentRate_;
        builderData.pendingRewards = 0;

        // Update user data
        userData.withdrawLockStart = 0;
        userData.withdrawLockEnd = 0;

        totalDistributed += pendingRewards_;

        // Transfer rewards
        uint256 amountToClaim_ = _payFee(pendingRewards_, "claim");
        IERC20(depositToken).safeTransfer(receiver_, amountToClaim_);

        emit AdminClaimed(builderPoolId_, receiver_, amountToClaim_);
    }

    function removeUpgradeability() external onlyOwner {
        isNotUpgradeable = true;
    }

    function getTotalReward() public view returns (uint256) {
        return IERC20(depositToken).balanceOf(address(this)) + totalDistributed;
    }

    function getCurrentUserMultiplier(uint256 builderPoolId_, address user_) external view returns (uint256) {
        if (!_poolExists(builderPoolId_)) {
            return PRECISION;
        }

        UserData storage userData = usersData[user_][builderPoolId_];

        return _getWithdrawLockPeriodMultiplier(userData.withdrawLockStart, userData.withdrawLockEnd);
    }

    function getCurrentBuilderReward(uint256 builderPoolId_) external view returns (uint256) {
        if (!_poolExists(builderPoolId_)) {
            return 0;
        }

        return _getCurrentBuilderReward(_getCurrentRate(), buildersData[builderPoolId_]);
    }

    function _payFee(uint256 amount_, string memory operation_) internal returns (uint256) {
        (uint256 feePercent_, address treasuryAddress_) = IFeeConfig(feeConfig).getFeeAndTreasuryForOperation(
            address(this),
            operation_
        );

        uint256 fee_ = (amount_ * feePercent_) / PRECISION;
        if (fee_ == 0) {
            return amount_;
        }

        IERC20(depositToken).safeTransfer(treasuryAddress_, fee_);

        emit FeePaid(_msgSender(), operation_, fee_, treasuryAddress_);

        return amount_ - fee_;
    }

    function _getCurrentRate() private view returns (uint256) {
        if (poolData.totalVirtualDeposited == 0) {
            return poolData.rate;
        }

        uint256 rewards_ = getTotalReward();

        return poolData.rate + (rewards_ * PRECISION) / poolData.totalVirtualDeposited;
    }

    function _getCurrentBuilderReward(
        uint256 currentRate_,
        BuilderData memory builderData_
    ) internal pure returns (uint256) {
        uint256 newRewards_ = ((currentRate_ - builderData_.rate) * builderData_.virtualDeposited) / PRECISION;

        return builderData_.pendingRewards + newRewards_;
    }

    /**
     * @dev tahn(x) = (e^x - e^(-x)) / (e^x + e^(-x))
     */
    function _tanh(uint128 x_) private pure returns (uint256) {
        int256 exp_x_ = LogExpMath.exp(int128(x_));
        int256 exp_minus_x = LogExpMath.exp(-int128(x_));

        return uint256(((exp_x_ - exp_minus_x) * int128(DECIMAL)) / (exp_x_ + exp_minus_x));
    }

    function _getWithdrawLockPeriodMultiplier(uint128 start_, uint128 end_) internal pure returns (uint256) {
        uint256 powerMax = 16_613_275_460_000_000_000; // 16.61327546 * DECIMAL

        uint256 maximalMultiplier_ = 10_700_000_000_000_000_000; // 10.7 * DECIMAL
        uint256 minimalMultiplier_ = DECIMAL; // 1 * DECIMAL

        uint128 periodStart_ = 1721908800; // Thu, 25 Jul 2024 12:00:00 UTC
        uint128 periodEnd_ = 2211192000; // Thu, 26 Jan 2040 12:00:00 UTC TODO
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

    function _poolExists(uint256 builderPoolId_) private view returns (bool) {
        return builderPoolId_ < builders.length;
    }

    function _authorizeUpgrade(address) internal view override onlyOwner {
        require(!isNotUpgradeable, "BU: upgrade isn't available");
    }
}
