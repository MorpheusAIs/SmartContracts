// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import {PRECISION} from "@solarity/solidity-lib/utils/Globals.sol";

import {IFeeConfig} from "../interfaces/IFeeConfig.sol";
import {IBuilders, IERC165} from "../interfaces/builders/IBuilders.sol";
import {IBuildersTreasury} from "../interfaces/builders/IBuildersTreasury.sol";

import {LockMultiplierMath} from "../libs/LockMultiplierMath.sol";

contract Builders is IBuilders, UUPSUpgradeable, OwnableUpgradeable {
    using SafeERC20 for IERC20;

    address public feeConfig;
    address public buildersTreasury;

    address public depositToken;

    uint128 public editPoolDeadline;
    uint256 public minimalWithdrawLockPeriod;

    uint256 public nextPoolId;

    TotalPoolData public totalPoolData;
    mapping(uint256 => BuilderPool) public builderPools;
    mapping(uint256 => BuilderPoolData) public buildersPoolData;

    mapping(address => mapping(uint256 => UserData)) public usersData;

    bytes32 private constant WITHDRAW_OPERATION = "withdraw";
    bytes32 private constant CLAIM_OPERATION = "claim";

    modifier poolExists(uint256 builderPoolId_) {
        require(_poolExists(builderPoolId_), "BU: pool doesn't exist");
        _;
    }

    constructor() {
        _disableInitializers();
    }

    function Builders_init(
        address depositToken_,
        address feeConfig_,
        address buildersTreasury_,
        uint128 editPoolDeadline_,
        uint256 minimalWithdrawLockPeriod_
    ) external initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();

        setFeeConfig(feeConfig_);
        setBuildersTreasury(buildersTreasury_);
        setEditPoolDeadline(editPoolDeadline_);
        setMinimalWithdrawLockPeriod(minimalWithdrawLockPeriod_);
        depositToken = depositToken_;
    }

    function supportsInterface(bytes4 interfaceId_) external pure returns (bool) {
        return interfaceId_ == type(IBuilders).interfaceId || interfaceId_ == type(IERC165).interfaceId;
    }

    function setFeeConfig(address feeConfig_) public onlyOwner {
        require(IERC165(feeConfig_).supportsInterface(type(IFeeConfig).interfaceId), "BU: invalid fee config");

        feeConfig = feeConfig_;

        emit FeeConfigSet(feeConfig_);
    }

    function setBuildersTreasury(address buildersTreasury_) public onlyOwner {
        require(
            IERC165(buildersTreasury_).supportsInterface(type(IBuildersTreasury).interfaceId),
            "BU: invalid builders treasury"
        );

        buildersTreasury = buildersTreasury_;

        emit BuildersTreasurySet(buildersTreasury_);
    }

    function setEditPoolDeadline(uint128 editPoolDeadline_) public onlyOwner {
        editPoolDeadline = editPoolDeadline_;

        emit EditPoolDeadlineSet(editPoolDeadline_);
    }

    function setMinimalWithdrawLockPeriod(uint256 minimalWithdrawLockPeriod_) public onlyOwner {
        minimalWithdrawLockPeriod = minimalWithdrawLockPeriod_;

        emit MinimalWithdrawLockPeriodSet(minimalWithdrawLockPeriod_);
    }

    function createBuilderPool(BuilderPool calldata builderPool_) public {
        _validateBuilderPool(builderPool_);

        uint256 builderPoolId_ = nextPoolId++;

        builderPools[builderPoolId_] = builderPool_;

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
        require(block.timestamp + editPoolDeadline < poolStart_, "BU: pool edit deadline is over");
        require(builderPool_.poolStart >= poolStart_, "BU: invalid pool start value");

        builderPools[builderPoolId_] = builderPool_;

        emit BuilderPoolEdited(builderPoolId_, builderPool_);
    }

    function deposit(uint256 builderPoolId_, uint256 amount_) external poolExists(builderPoolId_) {
        require(amount_ > 0, "BU: nothing to deposit");

        address user_ = _msgSender();

        BuilderPool storage builderPool = builderPools[builderPoolId_];
        require(block.timestamp >= builderPool.poolStart, "BU: pool isn't started");

        BuilderPoolData storage builderPoolData = buildersPoolData[builderPoolId_];
        UserData storage userData = usersData[user_][builderPoolId_];

        uint256 deposited_ = userData.deposited + amount_;
        require(deposited_ >= builderPool.minimalDeposit, "BU: amount too low");

        uint256 currentRate_ = _getCurrentRate();

        uint256 pendingRewards_ = _getCurrentBuilderReward(currentRate_, builderPoolData);

        uint256 multiplier_ = LockMultiplierMath._getLockPeriodMultiplier(
            uint128(block.timestamp),
            builderPool.claimLockEnd
        );
        uint256 virtualDeposited_ = (deposited_ * multiplier_) / PRECISION;

        // Update pool data
        totalPoolData.distributedRewards += getNotDistributedRewards();
        totalPoolData.rate = currentRate_;
        totalPoolData.totalVirtualDeposited =
            totalPoolData.totalVirtualDeposited +
            virtualDeposited_ -
            userData.virtualDeposited;

        // Update builder data
        builderPoolData.rate = currentRate_;
        builderPoolData.pendingRewards = pendingRewards_;
        builderPoolData.virtualDeposited =
            builderPoolData.virtualDeposited +
            virtualDeposited_ -
            userData.virtualDeposited;

        // Update user data
        userData.lastDeposit = uint128(block.timestamp);
        userData.deposited = deposited_;
        userData.virtualDeposited = virtualDeposited_;
        userData.claimLockStart = uint128(block.timestamp);

        IERC20(depositToken).safeTransferFrom(_msgSender(), address(this), amount_);

        emit UserDeposited(builderPoolId_, user_, amount_);
        emit UserLocked(builderPoolId_, user_, uint128(block.timestamp), builderPool.claimLockEnd);
    }

    function withdraw(uint256 builderPoolId_, uint256 amount_) external poolExists(builderPoolId_) {
        require(amount_ > 0, "BU: nothing to withdraw");

        address user_ = _msgSender();

        BuilderPool storage builderPool = builderPools[builderPoolId_];
        BuilderPoolData storage builderPoolData = buildersPoolData[builderPoolId_];
        UserData storage userData = usersData[user_][builderPoolId_];

        require(
            block.timestamp > userData.lastDeposit + builderPool.withdrawLockPeriodAfterDeposit,
            "BU: user withdraw is locked"
        );

        if (amount_ > userData.deposited) {
            amount_ = userData.deposited;
        }

        uint256 newDeposited_ = userData.deposited - amount_;
        require(newDeposited_ >= builderPool.minimalDeposit || newDeposited_ == 0, "BU: invalid withdraw amount");

        (uint256 fee_, uint256 amountToWithdraw_, address treasuryAddress_) = _getFee(amount_, WITHDRAW_OPERATION);

        IERC20(depositToken).safeTransfer(treasuryAddress_, fee_);
        IERC20(depositToken).safeTransfer(user_, amountToWithdraw_);

        uint256 currentRate_ = _getCurrentRate();

        uint256 pendingRewards_ = _getCurrentBuilderReward(currentRate_, builderPoolData);

        uint256 multiplier_ = LockMultiplierMath._getLockPeriodMultiplier(
            uint128(block.timestamp),
            builderPool.claimLockEnd
        );
        uint256 virtualDeposited_ = (newDeposited_ * multiplier_) / PRECISION;

        // Update pool data
        totalPoolData.distributedRewards += getNotDistributedRewards();
        totalPoolData.rate = currentRate_;
        totalPoolData.totalVirtualDeposited =
            totalPoolData.totalVirtualDeposited +
            virtualDeposited_ -
            userData.virtualDeposited;

        // Update builder data
        builderPoolData.rate = currentRate_;
        builderPoolData.pendingRewards = pendingRewards_;
        builderPoolData.virtualDeposited =
            builderPoolData.virtualDeposited +
            virtualDeposited_ -
            userData.virtualDeposited;

        // Update user data
        userData.deposited = newDeposited_;
        userData.virtualDeposited = virtualDeposited_;
        userData.claimLockStart = uint128(block.timestamp);

        emit UserWithdrawn(builderPoolId_, user_, amountToWithdraw_);
        emit UserLocked(builderPoolId_, user_, uint128(block.timestamp), builderPool.claimLockEnd);
        emit FeePaid(user_, WITHDRAW_OPERATION, fee_, treasuryAddress_);
    }

    function claim(uint256 builderPoolId_, address receiver_) external poolExists(builderPoolId_) {
        address user_ = _msgSender();
        require(user_ == builderPools[builderPoolId_].admin, "BU: only admin can claim rewards");

        BuilderPoolData storage builderPoolData = buildersPoolData[builderPoolId_];

        uint256 currentRate_ = _getCurrentRate();
        uint256 pendingRewards_ = _getCurrentBuilderReward(currentRate_, builderPoolData);
        require(pendingRewards_ > 0, "BU: nothing to claim");

        // Update pool data
        totalPoolData.distributedRewards += getNotDistributedRewards();
        totalPoolData.rate = currentRate_;

        // Update builder data
        builderPoolData.rate = currentRate_;
        builderPoolData.pendingRewards = 0;

        // Transfer rewards
        (uint256 fee_, uint256 amountToClaim_, address treasuryAddress_) = _getFee(pendingRewards_, CLAIM_OPERATION);
        IERC20(depositToken).safeTransfer(treasuryAddress_, fee_);
        IBuildersTreasury(buildersTreasury).sendRewards(receiver_, amountToClaim_);

        emit AdminClaimed(builderPoolId_, receiver_, amountToClaim_);
        emit FeePaid(user_, CLAIM_OPERATION, fee_, treasuryAddress_);
    }

    function getNotDistributedRewards() public view returns (uint256) {
        return IBuildersTreasury(buildersTreasury).getAllRewards() - totalPoolData.distributedRewards;
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

        BuilderPool storage builderPool = builderPools[builderPoolId_];
        UserData storage userData = usersData[user_][builderPoolId_];

        return LockMultiplierMath._getLockPeriodMultiplier(userData.claimLockStart, builderPool.claimLockEnd);
    }

    function getCurrentBuilderReward(uint256 builderPoolId_) external view returns (uint256) {
        if (!_poolExists(builderPoolId_)) {
            return 0;
        }

        return _getCurrentBuilderReward(_getCurrentRate(), buildersPoolData[builderPoolId_]);
    }

    function _validateBuilderPool(BuilderPool calldata builderPool_) internal view {
        require(bytes(builderPool_.name).length != 0, "BU: invalid project name");
        require(builderPool_.admin != address(0), "BU: invalid admin address");
        require(builderPool_.withdrawLockPeriodAfterDeposit >= minimalWithdrawLockPeriod, "BU: invalid withdraw lock");
        require(builderPool_.poolStart > block.timestamp, "BU: invalid pool start value");
    }

    function _getFee(uint256 amount_, bytes32 operation_) internal view returns (uint256, uint256, address) {
        (uint256 feePart_, address treasuryAddress_) = IFeeConfig(feeConfig).getFeeAndTreasuryForOperation(
            address(this),
            operation_
        );

        uint256 fee_ = (amount_ * feePart_) / PRECISION;
        uint256 amountWithoutFee_ = amount_ - fee_;

        return (fee_, amountWithoutFee_, treasuryAddress_);
    }

    function _getCurrentRate() private view returns (uint256) {
        if (totalPoolData.totalVirtualDeposited == 0) {
            return totalPoolData.rate;
        }

        uint256 rewards_ = getNotDistributedRewards();

        return totalPoolData.rate + (rewards_ * PRECISION) / totalPoolData.totalVirtualDeposited;
    }

    function _getCurrentBuilderReward(
        uint256 currentRate_,
        BuilderPoolData memory builderPoolData_
    ) internal pure returns (uint256) {
        uint256 newRewards_ = ((currentRate_ - builderPoolData_.rate) * builderPoolData_.virtualDeposited) / PRECISION;

        return builderPoolData_.pendingRewards + newRewards_;
    }

    function _poolExists(uint256 builderPoolId_) private view returns (bool) {
        return builderPoolId_ < nextPoolId;
    }

    function _authorizeUpgrade(address) internal view override onlyOwner {}
}
