// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {PRECISION} from "@solarity/solidity-lib/utils/Globals.sol";

import {IFeeConfig} from "../interfaces/IFeeConfig.sol";
import {IBuilderSubnets, IERC165} from "../interfaces/builder-subnets/IBuilderSubnets.sol";
import {IBuildersTreasury} from "../interfaces/builders/IBuildersTreasury.sol";

import {LockMultiplierMath} from "../libs/LockMultiplierMath.sol";
import {LinearDistributionIntervalDecrease} from "../libs/LinearDistributionIntervalDecrease.sol";

contract BuilderSubnets is IBuilderSubnets, UUPSUpgradeable, OwnableUpgradeable {
    using Math for *;
    using SafeERC20 for IERC20;

    /** @dev Contract that support IFeeConfig interface */
    address public feeConfig;

    /** @dev Stake and reward token */
    address public token;

    /** @dev Rewards are taken from this address */
    address public treasury;

    /** @dev Staker tokens locked for this period (at least) after the stake */
    uint256 public minWithdrawLockPeriodAfterStake;

    /** @dev `subnetCreationFeeAmount` is taken from the Builder when the Subnet is created and sent to the `subnetCreationFeeTreasury` */
    uint256 public subnetCreationFeeAmount;
    address public subnetCreationFeeTreasury;

    /** @dev This variable is required for calculations, it sets the time at which
     * the calculation of rewards will start. That is, before this time the rewards
     * will not be calculated.
     */
    uint128 public rewardCalculationStartsAt;

    /** @dev This variable is required for calculations, sets the percent for the
     * current smart contract to the total reward pool. Since the current contract
     * can be deployed on multiple networks and the reward pool is shared, we can
     * define the share of the reward pool for the current contract (e.g. 20% for
     * a contract on Arbitrum and 80% on Base). The amount of stakes into this contract
     * cannot exceed the share of the total reward pool for this contract.
     */
    uint256 public maxStakedShareForBuildersPool;

    /** @dev This parameter is needed to migrate stakes from V1.
     * It should be turned off after the migration is complete, because a restake from
     * other accounts will update the power factor, which may not be desirable. Also,
     * subnet creation can't be in the past.
     */
    bool public isMigrationOver;

    uint256 public totalStaked;
    uint256 public totalVirtualStaked;

    BuildersPoolData public buildersPoolData;
    mapping(bytes32 subnetId => BuildersSubnet) public buildersSubnets;
    mapping(bytes32 subnetId => BuildersSubnetMetadata) public buildersSubnetsMetadata;
    mapping(bytes32 subnetId => BuildersSubnetData) public buildersSubnetsData;

    mapping(bytes32 subnetId => mapping(address stakerAddress => Staker)) public stakers;

    bytes32 public constant FEE_WITHDRAW_OPERATION =
        keccak256(abi.encodePacked("BuilderSubnets_FEE_WITHDRAW_OPERATION"));
    bytes32 public constant FEE_CLAIM_OPERATION = keccak256(abi.encodePacked("BuilderSubnets_FEE_CLAIM_OPERATION"));

    modifier onlyExistedSubnet(bytes32 subnetId_) {
        require(_subnetExists(subnetId_), "BS: the Subnet doesn't exist");
        _;
    }

    modifier onlySubnetOwner(bytes32 subnetId_) {
        require(_msgSender() == buildersSubnets[subnetId_].owner, "BS: not a Subnet owner");
        _;
    }

    constructor() {
        _disableInitializers();
    }

    function BuilderSubnets_init(
        address token_,
        address feeConfig_,
        address treasury_,
        uint256 minWithdrawLockPeriodAfterStake_
    ) external initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();

        setFeeConfig(feeConfig_);
        setTreasury(treasury_);
        setMinWithdrawLockPeriodAfterStake(minWithdrawLockPeriodAfterStake_);

        token = token_;
    }

    function supportsInterface(bytes4 interfaceId_) external pure returns (bool) {
        return interfaceId_ == type(IBuilderSubnets).interfaceId || interfaceId_ == type(IERC165).interfaceId;
    }

    /**********************************************************************************************/
    /*** Global contract management functionality for the contract `owner()`                    ***/
    /**********************************************************************************************/

    function setFeeConfig(address feeConfig_) public onlyOwner {
        require(IERC165(feeConfig_).supportsInterface(type(IFeeConfig).interfaceId), "BS: invalid fee config");

        feeConfig = feeConfig_;

        emit FeeConfigSet(feeConfig_);
    }

    function setTreasury(address treasury_) public onlyOwner {
        require(treasury_ != address(0), "BS: invalid  treasury");

        treasury = treasury_;

        emit TreasurySet(treasury_);
    }

    function setBuildersPoolData(BuildersPoolData calldata buildersPoolData_) external onlyOwner {
        buildersPoolData = buildersPoolData_;

        emit BuildersPoolDataSet(buildersPoolData_);
    }

    function setRewardCalculationStartsAt(uint128 rewardCalculationStartsAt_) external onlyOwner {
        rewardCalculationStartsAt = rewardCalculationStartsAt_;

        emit RewardCalculationStartsAtSet(rewardCalculationStartsAt_);
    }

    function setMaxStakedShareForBuildersPool(uint256 maxStakedShareForBuildersPool_) external onlyOwner {
        require(maxStakedShareForBuildersPool_ <= PRECISION, "BS: invalid percent");

        maxStakedShareForBuildersPool = maxStakedShareForBuildersPool_;

        emit MaxStakedShareForBuildersPoolSet(maxStakedShareForBuildersPool_);
    }

    function setMinWithdrawLockPeriodAfterStake(uint256 minWithdrawLockPeriodAfterStake_) public onlyOwner {
        minWithdrawLockPeriodAfterStake = minWithdrawLockPeriodAfterStake_;

        emit MinimalWithdrawLockPeriodSet(minWithdrawLockPeriodAfterStake_);
    }

    function setSubnetCreationFee(
        uint256 subnetCreationFeeAmount_,
        address subnetCreationFeeTreasury_
    ) public onlyOwner {
        require(subnetCreationFeeTreasury_ != address(0), "BS: invalid creation fee treasury");

        subnetCreationFeeAmount = subnetCreationFeeAmount_;
        subnetCreationFeeTreasury = subnetCreationFeeTreasury_;

        emit SubnetCreationFeeSet(subnetCreationFeeAmount_, subnetCreationFeeTreasury_);
    }

    function setIsMigrationOver(bool value_) external onlyOwner {
        isMigrationOver = value_;

        emit IsMigrationOverSet(value_);
    }

    /**********************************************************************************************/
    /*** Subnet management functionality for the Builders                                       ***/
    /**********************************************************************************************/

    function createSubnet(BuildersSubnet calldata subnet_, BuildersSubnetMetadata calldata metadata_) public {
        bytes32 subnetId_ = getSubnetId(subnet_.name);

        require(!_subnetExists(subnetId_), "BS: the subnet already exist");
        require(bytes(subnet_.name).length != 0, "BS: invalid name");
        require(subnet_.owner != address(0), "BS: invalid owner address");
        require(
            subnet_.withdrawLockPeriodAfterStake >= minWithdrawLockPeriodAfterStake,
            "BS: invalid withdraw lock period"
        );
        require(subnet_.maxClaimLockEnd >= subnet_.startsAt, "BS: invalid max claim lock end timestamp");
        require(subnet_.fee <= PRECISION, "BS: invalid fee percent");
        require(subnet_.feeTreasury != address(0), "BS: invalid fee treasury");
        if (isMigrationOver && _msgSender() != owner()) {
            require(subnet_.startsAt > block.timestamp, "BS: invalid starts at timestamp");
        }

        if (subnetCreationFeeAmount > 0) {
            IERC20(token).safeTransferFrom(_msgSender(), subnetCreationFeeTreasury, subnetCreationFeeAmount);
        }

        buildersSubnets[subnetId_] = subnet_;
        buildersSubnetsMetadata[subnetId_] = metadata_;

        emit SubnetEdited(subnetId_, subnet_);
        emit SubnetMetadataEdited(subnetId_, metadata_);
    }

    function editSubnetMetadata(
        bytes32 subnetId_,
        BuildersSubnetMetadata calldata metadata_
    ) public onlySubnetOwner(subnetId_) {
        buildersSubnetsMetadata[subnetId_] = metadata_;

        emit SubnetMetadataEdited(subnetId_, metadata_);
    }

    function setSubnetOwnership(bytes32 subnetId_, address newValue_) public onlySubnetOwner(subnetId_) {
        require(newValue_ != address(0), "BS: new owner is the zero address");

        BuildersSubnet storage subnet = buildersSubnets[subnetId_];
        address oldValue_ = subnet.owner;

        subnet.owner = newValue_;

        emit SubnetOwnerSet(subnetId_, oldValue_, newValue_);
    }

    function setSubnetMinStake(bytes32 subnetId_, uint256 newValue_) public onlySubnetOwner(subnetId_) {
        BuildersSubnet storage subnet = buildersSubnets[subnetId_];
        uint256 oldValue_ = subnet.minStake;

        subnet.minStake = newValue_;

        emit SubnetMinStakeSet(subnetId_, oldValue_, newValue_);
    }

    function setSubnetFeeTreasury(bytes32 subnetId_, address newValue_) public onlySubnetOwner(subnetId_) {
        BuildersSubnet storage subnet = buildersSubnets[subnetId_];
        address oldValue_ = subnet.feeTreasury;

        require(newValue_ != address(0), "BS: invalid fee treasury");
        subnet.feeTreasury = newValue_;

        emit SubnetFeeTreasurySet(subnetId_, oldValue_, newValue_);
    }

    function setSubnetMaxClaimLockEnd(bytes32 subnetId_, uint128 newValue_) public onlySubnetOwner(subnetId_) {
        BuildersSubnet storage subnet = buildersSubnets[subnetId_];
        uint128 oldValue_ = subnet.maxClaimLockEnd;

        require(newValue_ > oldValue_, "BS: claim lock end too low");

        subnet.maxClaimLockEnd = newValue_;

        emit SubnetMaxClaimLockEndSet(subnetId_, oldValue_, newValue_);
    }

    function getSubnetId(string memory name_) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(name_));
    }

    /**********************************************************************************************/
    /*** Functionality for the users (Stakers)                                                  ***/
    /**********************************************************************************************/

    function stake(
        bytes32 subnetId_,
        address stakerAddress_,
        uint256 amount_,
        uint128 claimLockEnd_
    ) external onlyExistedSubnet(subnetId_) {
        if (isMigrationOver) {
            require(stakerAddress_ == _msgSender(), "BS: invalid sender");
        }

        BuildersSubnet storage subnet = buildersSubnets[subnetId_];
        require(amount_ > 0, "BS: nothing to stake");
        require(block.timestamp >= subnet.startsAt, "BS: stake isn't started");

        Staker storage staker = stakers[subnetId_][stakerAddress_];

        uint256 staked_ = staker.staked + amount_;
        require(staked_ >= subnet.minStake, "BS: staked amount too low");

        IERC20(token).safeTransferFrom(_msgSender(), address(this), amount_);

        claimLockEnd_ = uint128(
            (claimLockEnd_.max(staker.claimLockEnd).max(block.timestamp)).min(subnet.maxClaimLockEnd)
        );

        _updateStorage(subnetId_, stakerAddress_, staked_, claimLockEnd_, uint128(block.timestamp));
        staker.lastStake = uint128(block.timestamp);

        emit Staked(subnetId_, stakerAddress_, staker);
    }

    function withdraw(bytes32 subnetId_, uint256 amount_) external onlyExistedSubnet(subnetId_) {
        address stakerAddress_ = _msgSender();

        BuildersSubnet storage subnet = buildersSubnets[subnetId_];
        Staker storage staker = stakers[subnetId_][stakerAddress_];
        if (amount_ > staker.staked) {
            amount_ = staker.staked;
        }
        require(amount_ > 0, "BS: nothing to withdraw");
        uint256 minAllowedWithdrawalTimestamp_ = staker.lastStake + subnet.withdrawLockPeriodAfterStake;
        require(block.timestamp > minAllowedWithdrawalTimestamp_, "BS: user withdraw is locked");
        uint256 staked_ = staker.staked - amount_;
        require(staked_ >= subnet.minStake || staked_ == 0, "BS: min stake reached");

        _updateStorage(subnetId_, stakerAddress_, staked_, staker.claimLockEnd, uint128(block.timestamp));

        (uint256 fee_, address treasuryAddress_) = _getProtocolFee(amount_, FEE_WITHDRAW_OPERATION);
        if (fee_ > 0) {
            IERC20(token).safeTransfer(treasuryAddress_, fee_);
            amount_ -= fee_;

            emit FeePaid(subnetId_, stakerAddress_, fee_, treasuryAddress_);
        }

        IERC20(token).safeTransfer(stakerAddress_, amount_);

        emit Withdrawn(subnetId_, stakerAddress_, staker, amount_);
    }

    function claim(bytes32 subnetId_, address stakerAddress_) external onlyExistedSubnet(subnetId_) {
        Staker storage staker = stakers[subnetId_][stakerAddress_];
        require(block.timestamp > staker.claimLockEnd, "BS: claim is locked");

        _updateStorage(subnetId_, stakerAddress_, staker.staked, staker.claimLockEnd, uint128(block.timestamp));
        uint256 toClaim_ = staker.pendingRewards;
        staker.pendingRewards = 0;

        require(toClaim_ > 0, "BS: nothing to claim");

        (uint256 protocolFee_, address protocolTreasury_) = _getProtocolFee(toClaim_, FEE_CLAIM_OPERATION);
        (uint256 subnetFee_, address subnetTreasury_) = _getSubnetFee(toClaim_, subnetId_);
        if (protocolFee_ > 0) {
            IERC20(token).safeTransferFrom(treasury, protocolTreasury_, protocolFee_);
            toClaim_ -= protocolFee_;

            emit FeePaid(subnetId_, stakerAddress_, protocolFee_, protocolTreasury_);
        }
        if (subnetFee_ > 0) {
            if (subnetFee_ > toClaim_) {
                subnetFee_ = toClaim_;
            }
            IERC20(token).safeTransferFrom(treasury, subnetTreasury_, subnetFee_);
            toClaim_ -= subnetFee_;

            emit FeePaid(subnetId_, stakerAddress_, subnetFee_, subnetTreasury_);
        }
        if (toClaim_ > 0) {
            IERC20(token).safeTransferFrom(treasury, stakerAddress_, toClaim_);

            emit Claimed(subnetId_, stakerAddress_, staker, toClaim_);
        }
    }

    /**
     * @dev With claiming, there can be so many calculation periods that a transaction
     * won't fit into a block. In this case, we can use this function to calculate
     * rewards in parts.
     */
    function collectPendingRewards(
        bytes32 subnetId_,
        address stakerAddress_,
        uint128 to_
    ) external onlyExistedSubnet(subnetId_) {
        Staker storage staker = stakers[subnetId_][stakerAddress_];

        to_ = uint128(to_.min(block.timestamp));
        _updateStorage(subnetId_, stakerAddress_, staker.staked, staker.claimLockEnd, to_);

        emit PendingRewardsCollected(subnetId_, stakerAddress_, staker);
    }

    function getMaxTotalVirtualStaked(uint128 to_) public view returns (uint256) {
        return (maxStakedShareForBuildersPool * getPeriodRewardForBuildersPool(0, to_)) / PRECISION;
    }

    function _updateStorage(
        bytes32 subnetId_,
        address stakerAddress_,
        uint256 newStaked_,
        uint128 claimLockEnd_,
        uint128 interactionTimestamp_
    ) internal {
        Staker storage staker = stakers[subnetId_][stakerAddress_];
        uint256 pendingRewards_ = getStakerRewards(subnetId_, stakerAddress_, interactionTimestamp_);

        if (newStaked_ != staker.staked) {
            BuildersSubnetData storage buildersSubnetData = buildersSubnetsData[subnetId_];

            uint256 multiplier_ = getPowerFactor(interactionTimestamp_, claimLockEnd_);
            uint256 newVirtualStaked_ = (newStaked_ * multiplier_) / PRECISION;

            // Update global contract data
            totalStaked = totalStaked + newStaked_ - staker.staked;
            totalVirtualStaked = totalVirtualStaked + newVirtualStaked_ - staker.virtualStaked;
            require(
                totalVirtualStaked <= getMaxTotalVirtualStaked(interactionTimestamp_),
                "BS: the amount of stakes exceeded the amount of rewards"
            );

            // Update Subnet data
            buildersSubnetData.staked = buildersSubnetData.staked + newStaked_ - staker.staked;
            buildersSubnetData.virtualStaked =
                buildersSubnetData.virtualStaked +
                newVirtualStaked_ -
                staker.virtualStaked;

            // Update Staker data
            staker.staked = newStaked_;
            staker.virtualStaked = newVirtualStaked_;
        }

        // Update Staker data
        staker.lastInteraction = interactionTimestamp_;
        staker.claimLockEnd = claimLockEnd_;
        staker.pendingRewards = pendingRewards_;
    }

    /**********************************************************************************************/
    /*** Functionality for the Power Factor                                                     ***/
    /**********************************************************************************************/

    function getStakerPowerFactor(bytes32 subnetId_, address stakerAddress_) public view returns (uint256) {
        if (!_subnetExists(subnetId_)) {
            return PRECISION;
        }

        Staker storage staker = stakers[subnetId_][stakerAddress_];

        return getPowerFactor(staker.lastStake, staker.claimLockEnd);
    }

    function getPowerFactor(uint128 from_, uint128 to_) public pure returns (uint256) {
        return LockMultiplierMath.getLockPeriodMultiplier(from_, to_);
    }

    /**********************************************************************************************/
    /*** Functionality for the rewards calculation                                              ***/
    /**********************************************************************************************/

    function getStakerRewards(bytes32 subnetId_, address stakerAddress_, uint128 to_) public view returns (uint256) {
        Staker storage staker = stakers[subnetId_][stakerAddress_];

        uint256 from_ = (staker.lastInteraction == 0 ? block.timestamp : staker.lastInteraction).max(
            rewardCalculationStartsAt
        );
        if (from_ >= block.timestamp) {
            return 0;
        }

        uint256 currentRewards_ = getPeriodRewardForStake(staker.virtualStaked, uint128(from_), to_);

        return staker.pendingRewards + currentRewards_;
    }

    /**
     * @dev Rewards are calculated in computation periods that are less than or equal to one day from the last
     * calculated timestamp. For example, if the stake was 2 days 3 hours, there will be 3 calculation periods,
     * 2 for 1 day and 1 for 3 hours.
     *
     * `emissionToPeriodEnd` - Emission from pool start to the end of period. Ethereum network, main Builders pool.
     * `emissionFromPeriodStartToPeriodEnd` - Emission from the period start to the period end. Ethereum network, main Builders pool.
     * `virtualStaked` - Staker stake * Power Factor
     *
     * `shareForPeriod` = `virtualStaked` / `emissionToPeriodEnd`
     * `rewardForPeriod` = `shareForPeriod` * `emissionFromPeriodStartToPeriodEnd`
     * `reward` = Σ(`rewardForPeriod`)
     */
    function getPeriodRewardForStake(uint256 virtualStaked_, uint128 from_, uint128 to_) public view returns (uint256) {
        if (to_ <= from_) {
            return 0;
        }
        uint128 period_ = 1 days;
        uint256 periods_ = (to_ - from_) / period_;

        uint256 rewards_ = 0;
        for (uint256 i = 0; i <= periods_; i++) {
            uint128 toForPeriod_ = from_ + period_;
            if (toForPeriod_ > to_) {
                toForPeriod_ = to_;
            }

            uint256 emissionToPeriodEnd_ = getPeriodRewardForBuildersPool(0, toForPeriod_);
            if (emissionToPeriodEnd_ == 0) {
                from_ = toForPeriod_;

                continue;
            }

            uint256 emissionFromPeriodStartToPeriodEnd_ = getPeriodRewardForBuildersPool(from_, toForPeriod_);
            uint256 shareForPeriod_ = (virtualStaked_ * PRECISION) / emissionToPeriodEnd_;

            rewards_ += (shareForPeriod_ * emissionFromPeriodStartToPeriodEnd_) / PRECISION;
            from_ = toForPeriod_;
        }

        return rewards_;
    }

    function getPeriodRewardForBuildersPool(uint128 from_, uint128 to_) public view returns (uint256) {
        return
            LinearDistributionIntervalDecrease.getPeriodReward(
                buildersPoolData.initialAmount,
                buildersPoolData.decreaseAmount,
                buildersPoolData.payoutStart,
                buildersPoolData.interval,
                from_,
                to_
            );
    }

    /**********************************************************************************************/
    /*** Functionality for the fees                                                             ***/
    /**********************************************************************************************/

    function _getProtocolFee(uint256 amount_, bytes32 operation_) private view returns (uint256, address) {
        (uint256 feePart_, address treasuryAddress_) = IFeeConfig(feeConfig).getFeeAndTreasuryForOperation(
            address(this),
            operation_
        );

        uint256 fee_ = (amount_ * feePart_) / PRECISION;

        return (fee_, treasuryAddress_);
    }

    function _getSubnetFee(uint256 amount_, bytes32 subnetId_) private view returns (uint256, address) {
        BuildersSubnet storage subnet = buildersSubnets[subnetId_];

        uint256 fee_ = (amount_ * subnet.fee) / PRECISION;

        return (fee_, subnet.feeTreasury);
    }

    /**********************************************************************************************/
    /*** UUPS and other functionalities                                                         ***/
    /**********************************************************************************************/

    function version() external pure returns (uint256) {
        return 1;
    }

    function _subnetExists(bytes32 subnetId_) private view returns (bool) {
        return buildersSubnets[subnetId_].owner != address(0);
    }

    function _authorizeUpgrade(address) internal view override onlyOwner {}
}
