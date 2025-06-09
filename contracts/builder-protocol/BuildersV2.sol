// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import {PRECISION} from "@solarity/solidity-lib/utils/Globals.sol";

import {IFeeConfig} from "../interfaces/builder-protocol/IFeeConfig.sol";
import {IBuilders, IERC165} from "../interfaces/builder-protocol/old/IBuilders.sol";
import {IBuildersTreasury} from "../interfaces/builder-protocol/IBuildersTreasury.sol";

import {LockMultiplierMath} from "../libs/LockMultiplierMath.sol";

contract BuildersV2 is IBuilders, UUPSUpgradeable, OwnableUpgradeable {
    using SafeERC20 for IERC20;

    address public feeConfig;
    address public buildersTreasury;

    address public depositToken;

    uint128 public editPoolDeadline;
    uint256 public minimalWithdrawLockPeriod;

    TotalPoolData public totalPoolData;
    mapping(bytes32 builderPoolId => BuilderPool) public builderPools;
    mapping(bytes32 builderPoolId => BuilderPoolData) public buildersPoolData;

    mapping(address user => mapping(bytes32 builderPoolId => UserData)) public usersData;

    bytes32 private constant FEE_WITHDRAW_OPERATION = "withdraw";
    bytes32 private constant FEE_CLAIM_OPERATION = "claim";

    modifier poolExists(bytes32 builderPoolId_) {
        require(_poolExists(builderPoolId_), "BU: pool doesn't exist");
        _;
    }

    constructor() {
        _disableInitializers();
    }

    function BuildersV2_init(
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
        bytes32 builderPoolId_ = getPoolId(builderPool_.name);

        require(!_poolExists(builderPoolId_), "BU: pool already exist");

        _validateBuilderPool(builderPool_);

        builderPools[builderPoolId_] = builderPool_;

        emit BuilderPoolCreated(builderPoolId_, builderPool_);
    }

    function editBuilderPool(BuilderPool calldata builderPool_) external {
        bytes32 builderPoolId_ = getPoolId(builderPool_.name);

        require(_poolExists(builderPoolId_), "BU: pool doesn't exist");

        _validateBuilderPool(builderPool_);

        BuilderPool storage builderPool = builderPools[builderPoolId_];

        require(_msgSender() == builderPool.admin, "BU: only admin can edit pool");

        uint256 poolStart_ = builderPool.poolStart;
        require(block.timestamp + editPoolDeadline < poolStart_, "BU: pool edit deadline is over");
        require(builderPool_.poolStart >= poolStart_, "BU: invalid pool start value");

        builderPools[builderPoolId_] = builderPool_;

        emit BuilderPoolEdited(builderPoolId_, builderPool_);
    }

    function deposit(bytes32 builderPoolId_, uint256 amount_) external poolExists(builderPoolId_) {
        require(amount_ > 0, "BU: nothing to deposit");

        address user_ = _msgSender();

        BuilderPool storage builderPool = builderPools[builderPoolId_];
        require(block.timestamp >= builderPool.poolStart, "BU: pool isn't started");

        UserData storage userData = usersData[user_][builderPoolId_];

        uint256 deposited_ = userData.deposited + amount_;
        require(deposited_ >= builderPool.minimalDeposit, "BU: amount too low");

        IERC20(depositToken).safeTransferFrom(_msgSender(), address(this), amount_);

        _updatePoolData(builderPoolId_, deposited_, userData);
        userData.lastDeposit = uint128(block.timestamp);

        emit UserDeposited(builderPoolId_, user_, amount_);
    }

    function withdraw(bytes32 builderPoolId_, uint256 amount_) external poolExists(builderPoolId_) {
        address user_ = _msgSender();

        BuilderPool storage builderPool = builderPools[builderPoolId_];
        UserData storage userData = usersData[user_][builderPoolId_];

        if (amount_ > userData.deposited) {
            amount_ = userData.deposited;
        }
        require(amount_ > 0, "BU: nothing to withdraw");

        require(
            block.timestamp > userData.lastDeposit + builderPool.withdrawLockPeriodAfterDeposit,
            "BU: user withdraw is locked"
        );

        uint256 newDeposited_ = userData.deposited - amount_;
        require(newDeposited_ >= builderPool.minimalDeposit || newDeposited_ == 0, "BU: invalid withdraw amount");

        _updatePoolData(builderPoolId_, newDeposited_, userData);

        (uint256 fee_, address treasuryAddress_) = _getFee(amount_, FEE_WITHDRAW_OPERATION);
        if (fee_ > 0) {
            IERC20(depositToken).safeTransfer(treasuryAddress_, fee_);

            amount_ -= fee_;
        }
        IERC20(depositToken).safeTransfer(user_, amount_);

        emit UserWithdrawn(builderPoolId_, user_, amount_);
        emit FeePaid(user_, FEE_WITHDRAW_OPERATION, fee_, treasuryAddress_);
    }

    function claim(bytes32 builderPoolId_, address receiver_) external poolExists(builderPoolId_) {
        address user_ = _msgSender();

        BuilderPool storage builderPool = builderPools[builderPoolId_];

        require(user_ == builderPool.admin, "BU: only admin can claim rewards");
        require(block.timestamp > builderPool.claimLockEnd, "BU: claim is locked");

        BuilderPoolData storage builderPoolData = buildersPoolData[builderPoolId_];

        (uint256 currentRate_, uint256 newPoolRewards_) = _getCurrentRate();
        uint256 pendingRewards_ = _getCurrentBuilderReward(currentRate_, builderPoolData);
        require(pendingRewards_ > 0, "BU: nothing to claim");

        // Update pool data
        totalPoolData.distributedRewards += newPoolRewards_;
        totalPoolData.rate = currentRate_;
        totalPoolData.totalVirtualDeposited =
            totalPoolData.totalVirtualDeposited +
            builderPoolData.deposited -
            builderPoolData.virtualDeposited;

        // Update builder data
        builderPoolData.rate = currentRate_;
        builderPoolData.virtualDeposited = builderPoolData.deposited;
        builderPoolData.pendingRewards = 0;

        // Transfer rewards
        (uint256 fee_, address treasuryAddress_) = _getFee(pendingRewards_, FEE_CLAIM_OPERATION);
        if (fee_ > 0) {
            IBuildersTreasury(buildersTreasury).sendRewards(treasuryAddress_, fee_);

            pendingRewards_ -= fee_;
        }
        IBuildersTreasury(buildersTreasury).sendRewards(receiver_, pendingRewards_);

        emit AdminClaimed(builderPoolId_, receiver_, pendingRewards_);
        emit FeePaid(user_, FEE_CLAIM_OPERATION, fee_, treasuryAddress_);
    }

    function _updatePoolData(bytes32 builderPoolId_, uint256 newDeposited_, UserData storage userData) internal {
        BuilderPool storage builderPool = builderPools[builderPoolId_];
        BuilderPoolData storage builderPoolData = buildersPoolData[builderPoolId_];

        (uint256 currentRate_, uint256 newPoolRewards_) = _getCurrentRate();

        uint256 pendingRewards_ = _getCurrentBuilderReward(currentRate_, builderPoolData);

        uint256 multiplier_ = LockMultiplierMath.getLockPeriodMultiplier(
            uint128(block.timestamp),
            builderPool.claimLockEnd
        );
        uint256 virtualDeposited_ = (newDeposited_ * multiplier_) / PRECISION;
        uint256 oldVirtualDeposited_ = builderPoolData.virtualDeposited == builderPoolData.deposited
            ? userData.deposited
            : userData.virtualDeposited;

        // Update pool data
        totalPoolData.distributedRewards += newPoolRewards_;
        totalPoolData.rate = currentRate_;
        totalPoolData.totalDeposited = totalPoolData.totalDeposited + newDeposited_ - userData.deposited;
        totalPoolData.totalVirtualDeposited =
            totalPoolData.totalVirtualDeposited +
            virtualDeposited_ -
            oldVirtualDeposited_;

        // Update builder data
        builderPoolData.rate = currentRate_;
        builderPoolData.pendingRewards = pendingRewards_;
        builderPoolData.deposited = builderPoolData.deposited + newDeposited_ - userData.deposited;
        builderPoolData.virtualDeposited = builderPoolData.virtualDeposited + virtualDeposited_ - oldVirtualDeposited_;

        // Update user data
        userData.deposited = newDeposited_;
        userData.virtualDeposited = virtualDeposited_;
        userData.claimLockStart = uint128(block.timestamp);
    }

    function getNotDistributedRewards() public view returns (uint256) {
        return IBuildersTreasury(buildersTreasury).getAllRewards() - totalPoolData.distributedRewards;
    }

    function getCurrentUserMultiplier(bytes32 builderPoolId_, address user_) public view returns (uint256) {
        if (!_poolExists(builderPoolId_)) {
            return PRECISION;
        }

        BuilderPool storage builderPool = builderPools[builderPoolId_];
        UserData storage userData = usersData[user_][builderPoolId_];

        if (userData.claimLockStart == 0) {
            return PRECISION;
        }

        return LockMultiplierMath.getLockPeriodMultiplier(userData.claimLockStart, builderPool.claimLockEnd);
    }

    function getCurrentBuilderReward(bytes32 builderPoolId_) external view returns (uint256) {
        if (!_poolExists(builderPoolId_)) {
            return 0;
        }

        (uint256 currentRate_, ) = _getCurrentRate();

        return _getCurrentBuilderReward(currentRate_, buildersPoolData[builderPoolId_]);
    }

    function getLockPeriodMultiplier(uint128 lockStart_, uint128 lockEnd_) public pure returns (uint256) {
        return LockMultiplierMath.getLockPeriodMultiplier(lockStart_, lockEnd_);
    }

    function _validateBuilderPool(BuilderPool calldata builderPool_) internal view {
        require(bytes(builderPool_.name).length != 0, "BU: invalid project name");
        require(builderPool_.admin != address(0), "BU: invalid admin address");
        require(builderPool_.withdrawLockPeriodAfterDeposit >= minimalWithdrawLockPeriod, "BU: invalid withdraw lock");
        require(builderPool_.poolStart > block.timestamp, "BU: invalid pool start value");
    }

    function _getFee(uint256 amount_, bytes32 operation_) internal view returns (uint256, address) {
        (uint256 feePart_, address treasuryAddress_) = IFeeConfig(feeConfig).getFeeAndTreasuryForOperation(
            address(this),
            operation_
        );

        uint256 fee_ = (amount_ * feePart_) / PRECISION;

        return (fee_, treasuryAddress_);
    }

    function _getCurrentRate() private view returns (uint256, uint256) {
        if (totalPoolData.totalVirtualDeposited == 0) {
            return (totalPoolData.rate, 0);
        }

        uint256 rewards_ = getNotDistributedRewards();

        return (totalPoolData.rate + (rewards_ * PRECISION) / totalPoolData.totalVirtualDeposited, rewards_);
    }

    function _getCurrentBuilderReward(
        uint256 currentRate_,
        BuilderPoolData memory builderPoolData_
    ) internal pure returns (uint256) {
        uint256 newRewards_ = ((currentRate_ - builderPoolData_.rate) * builderPoolData_.virtualDeposited) / PRECISION;

        return builderPoolData_.pendingRewards + newRewards_;
    }

    function getPoolId(string memory builderPoolName_) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(builderPoolName_));
    }

    function _poolExists(bytes32 builderPoolId_) private view returns (bool) {
        return builderPools[builderPoolId_].admin != address(0);
    }

    function _authorizeUpgrade(address) internal view override onlyOwner {}

    /**********************************************************************************************/
    /*** V2 updates, functionality                                                              ***/
    /**********************************************************************************************/

    function version() external pure returns (uint256) {
        return 2;
    }
}
