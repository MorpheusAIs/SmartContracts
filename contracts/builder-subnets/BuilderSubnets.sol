// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {PRECISION} from "@solarity/solidity-lib/utils/Globals.sol";

import {IFeeConfig} from "../interfaces/IFeeConfig.sol";
import {IBuilderSubnets, IERC165} from "../interfaces/builder-subnets/IBuilderSubnets.sol";
import {IBuildersV3} from "../interfaces/builders/IBuildersV3.sol";

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
    address public buildersV3;

    // uint256 public totalStaked;
    // uint256 public totalVirtualStaked;

    BuildersRewardPoolData public buildersRewardPoolData;
    AllSubnetsData public allSubnetsData;

    mapping(bytes32 subnetId => Subnet) public subnets;
    mapping(bytes32 subnetId => SubnetMetadata) public subnetsMetadata;
    mapping(bytes32 subnetId => SubnetData) public subnetsData;

    mapping(bytes32 subnetId => mapping(address stakerAddress => Staker)) public stakers;

    bytes32 public constant FEE_WITHDRAW_OPERATION =
        keccak256(abi.encodePacked("BuilderSubnets_FEE_WITHDRAW_OPERATION"));
    bytes32 public constant FEE_CLAIM_OPERATION = keccak256(abi.encodePacked("BuilderSubnets_FEE_CLAIM_OPERATION"));

    modifier onlyExistedSubnet(bytes32 subnetId_) {
        require(_subnetExists(subnetId_), "BS: the Subnet doesn't exist");
        _;
    }

    modifier onlySubnetOwner(bytes32 subnetId_) {
        require(_msgSender() == subnets[subnetId_].owner, "BS: not a Subnet owner");
        _;
    }

    constructor() {
        _disableInitializers();
    }

    function BuilderSubnets_init(
        address token_,
        address feeConfig_,
        address treasury_,
        uint256 minWithdrawLockPeriodAfterStake_,
        address buildersV3_
    ) external initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();

        setFeeConfig(feeConfig_);
        setTreasury(treasury_);
        setMinWithdrawLockPeriodAfterStake(minWithdrawLockPeriodAfterStake_);

        token = token_;

        require(IERC165(buildersV3_).supportsInterface(type(IBuildersV3).interfaceId), "BS: invalid BuildersV3");
        buildersV3 = buildersV3_;
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

    function setBuildersRewardPoolData(BuildersRewardPoolData calldata buildersRewardPoolData_) external onlyOwner {
        buildersRewardPoolData = buildersRewardPoolData_;

        emit BuildersRewardPoolDataSet(buildersRewardPoolData_);
    }

    function setRewardCalculationStartsAt(uint128 rewardCalculationStartsAt_) external onlyOwner {
        require(rewardCalculationStartsAt_ > 0, "BS: can't be zero");
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
    ) external onlyOwner {
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

    function createSubnet(Subnet calldata subnet_, SubnetMetadata calldata metadata_) external {
        bytes32 subnetId_ = getSubnetId(subnet_.name);

        if (isMigrationOver != true) {
            _checkOwner();
        }
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

        subnets[subnetId_] = subnet_;
        subnetsMetadata[subnetId_] = metadata_;

        emit SubnetEdited(subnetId_, subnet_);
        emit SubnetMetadataEdited(subnetId_, metadata_);
    }

    function editSubnetMetadata(
        bytes32 subnetId_,
        SubnetMetadata calldata metadata_
    ) external onlySubnetOwner(subnetId_) {
        subnetsMetadata[subnetId_] = metadata_;

        emit SubnetMetadataEdited(subnetId_, metadata_);
    }

    function setSubnetOwnership(bytes32 subnetId_, address newValue_) external onlySubnetOwner(subnetId_) {
        require(newValue_ != address(0), "BS: new owner is the zero address");

        Subnet storage subnet = subnets[subnetId_];
        address oldValue_ = subnet.owner;

        subnet.owner = newValue_;

        emit SubnetOwnerSet(subnetId_, oldValue_, newValue_);
    }

    function setSubnetMinStake(bytes32 subnetId_, uint256 newValue_) external onlySubnetOwner(subnetId_) {
        Subnet storage subnet = subnets[subnetId_];
        uint256 oldValue_ = subnet.minStake;

        subnet.minStake = newValue_;

        emit SubnetMinStakeSet(subnetId_, oldValue_, newValue_);
    }

    function setSubnetFeeTreasury(bytes32 subnetId_, address newValue_) external onlySubnetOwner(subnetId_) {
        Subnet storage subnet = subnets[subnetId_];
        address oldValue_ = subnet.feeTreasury;

        require(newValue_ != address(0), "BS: invalid fee treasury");
        subnet.feeTreasury = newValue_;

        emit SubnetFeeTreasurySet(subnetId_, oldValue_, newValue_);
    }

    function setSubnetMaxClaimLockEnd(bytes32 subnetId_, uint128 newValue_) external onlySubnetOwner(subnetId_) {
        Subnet storage subnet = subnets[subnetId_];
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
            require(stakerAddress_ == _msgSender(), "BS: invalid sender (1)");
        } else {
            require(buildersV3 == _msgSender(), "BS: invalid sender (2)");
        }

        require(amount_ > 0, "BS: nothing to stake");
        Subnet storage subnet = subnets[subnetId_];
        require(block.timestamp >= subnet.startsAt, "BS: stake isn't started");

        Staker storage staker = stakers[subnetId_][stakerAddress_];

        uint256 staked_ = staker.staked + amount_;
        require(staked_ >= subnet.minStake, "BS: staked amount too low");

        IERC20(token).safeTransferFrom(_msgSender(), address(this), amount_);

        claimLockEnd_ = uint128(
            (claimLockEnd_.max(staker.claimLockEnd).max(block.timestamp)).min(subnet.maxClaimLockEnd)
        );

        _updateStorage(subnetId_, stakerAddress_, staked_, claimLockEnd_);
        staker.lastStake = uint128(block.timestamp);

        emit Staked(subnetId_, stakerAddress_, staker);
    }

    function withdraw(bytes32 subnetId_, uint256 amount_) external onlyExistedSubnet(subnetId_) {
        address stakerAddress_ = _msgSender();
        Subnet storage subnet = subnets[subnetId_];
        Staker storage staker = stakers[subnetId_][stakerAddress_];

        uint256 minAllowedWithdrawalTimestamp_ = staker.lastStake + subnet.withdrawLockPeriodAfterStake;
        require(block.timestamp > minAllowedWithdrawalTimestamp_, "BS: user withdraw is locked");
        if (amount_ > staker.staked) {
            amount_ = staker.staked;
        }
        require(amount_ > 0, "BS: nothing to withdraw");

        uint256 staked_ = staker.staked - amount_;
        require(staked_ >= subnet.minStake || staked_ == 0, "BS: min stake reached");

        _updateStorage(subnetId_, stakerAddress_, staked_, staker.claimLockEnd);

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

        _updateStorage(subnetId_, stakerAddress_, staker.staked, staker.claimLockEnd);
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
    function collectPendingRewards(uint128 to_) external {
        if (allSubnetsData.virtualStaked == 0) {
            allSubnetsData.lastCalculatedTimestamp = uint128(block.timestamp);
            return;
        }

        to_ = to_ > block.timestamp ? uint128(block.timestamp) : to_;

        uint256 currentRewards_ = getPeriodRewardForStake(
            allSubnetsData.virtualStaked,
            allSubnetsData.lastCalculatedTimestamp,
            to_
        );

        allSubnetsData.rate += (currentRewards_ * PRECISION) / allSubnetsData.virtualStaked;
        allSubnetsData.lastCalculatedTimestamp = to_;
    }

    function getMaxTotalVirtualStaked(uint128 to_) public view returns (uint256) {
        return (maxStakedShareForBuildersPool * getPeriodRewardForBuildersPool(0, to_)) / PRECISION;
    }

    function _updateStorage(
        bytes32 subnetId_,
        address stakerAddress_,
        uint256 newStaked_,
        uint128 claimLockEnd_
    ) internal {
        Staker storage staker = stakers[subnetId_][stakerAddress_];
        SubnetData storage subnetData = subnetsData[subnetId_];

        uint256 currentRate_ = _getCurrentRewardRate();
        uint256 pendingRewards_ = _getStakerRewards(currentRate_, staker);

        uint128 now_ = uint128(block.timestamp);
        uint256 multiplier_ = getPowerFactor(now_, claimLockEnd_);
        uint256 newVirtualStaked_ = (newStaked_ * multiplier_) / PRECISION;

        // Update data for all subnets
        allSubnetsData.lastCalculatedTimestamp = now_;
        allSubnetsData.rate = currentRate_;
        allSubnetsData.staked = allSubnetsData.staked + newStaked_ - staker.staked;
        allSubnetsData.virtualStaked = allSubnetsData.virtualStaked + newVirtualStaked_ - staker.virtualStaked;

        require(
            allSubnetsData.virtualStaked <= getMaxTotalVirtualStaked(now_),
            "BS: the amount of stakes exceeded the amount of rewards"
        );

        // Update Subnet data
        subnetData.staked = subnetData.staked + newStaked_ - staker.staked;
        subnetData.virtualStaked = subnetData.virtualStaked + newVirtualStaked_ - staker.virtualStaked;

        // Update data for the Staker
        staker.staked = newStaked_;
        staker.virtualStaked = newVirtualStaked_;
        staker.rate = currentRate_;
        staker.claimLockEnd = claimLockEnd_;
        staker.pendingRewards = pendingRewards_;
    }

    /**********************************************************************************************/
    /*** Functionality for the Power Factor                                                     ***/
    /**********************************************************************************************/

    function getStakerPowerFactor(bytes32 subnetId_, address stakerAddress_) external view returns (uint256) {
        if (!_subnetExists(subnetId_)) {
            return PRECISION;
        }

        Staker storage staker = stakers[subnetId_][stakerAddress_];

        return (staker.virtualStaked * PRECISION) / staker.staked;
    }

    function getPowerFactor(uint128 from_, uint128 to_) public pure returns (uint256) {
        return LockMultiplierMath._getLockPeriodMultiplier(from_, to_);
    }

    /**********************************************************************************************/
    /*** Functionality for the rewards calculation                                              ***/
    /**********************************************************************************************/

    function getStakerRewards(bytes32 subnetId_, address stakerAddress_) external view returns (uint256) {
        uint256 currentRate_ = _getCurrentRewardRate();

        return _getStakerRewards(currentRate_, stakers[subnetId_][stakerAddress_]);
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
        from_ = from_ < rewardCalculationStartsAt ? rewardCalculationStartsAt : from_;

        if (to_ <= from_ || virtualStaked_ == 0) {
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

            rewards_ += (virtualStaked_ * emissionFromPeriodStartToPeriodEnd_) / emissionToPeriodEnd_;
            from_ = toForPeriod_;
        }

        return rewards_;
    }

    function getPeriodRewardForBuildersPool(uint128 from_, uint128 to_) public view returns (uint256) {
        return
            LinearDistributionIntervalDecrease.getPeriodReward(
                buildersRewardPoolData.initialAmount,
                buildersRewardPoolData.decreaseAmount,
                buildersRewardPoolData.payoutStart,
                buildersRewardPoolData.interval,
                from_,
                to_
            );
    }

    function _getCurrentRewardRate() private view returns (uint256) {
        if (allSubnetsData.virtualStaked == 0) {
            return allSubnetsData.rate;
        }

        uint256 currentRewards_ = getPeriodRewardForStake(
            allSubnetsData.virtualStaked,
            allSubnetsData.lastCalculatedTimestamp,
            uint128(block.timestamp)
        );

        return allSubnetsData.rate + (currentRewards_ * PRECISION) / allSubnetsData.virtualStaked;
    }

    function _getStakerRewards(uint256 currentRewardRate_, Staker storage staker) private view returns (uint256) {
        uint256 rewards_ = ((currentRewardRate_ - staker.rate) * staker.virtualStaked) / PRECISION;

        return staker.pendingRewards + rewards_;
    }

    /**********************************************************************************************/
    /*** Functionality for the fees                                                             ***/
    /**********************************************************************************************/

    function _getProtocolFee(uint256 amount_, bytes32 operation_) private view returns (uint256, address) {
        (uint256 feePart_, address treasuryAddress_) = IFeeConfig(feeConfig).getFeeAndTreasuryForOperation(
            address(this),
            operation_
        );

        uint256 fee_ = amount_.mulDiv(feePart_, PRECISION, Math.Rounding.Up);

        return (fee_, treasuryAddress_);
    }

    function _getSubnetFee(uint256 amount_, bytes32 subnetId_) private view returns (uint256, address) {
        Subnet storage subnet = subnets[subnetId_];

        uint256 fee_ = amount_.mulDiv(subnet.fee, PRECISION, Math.Rounding.Up);

        return (fee_, subnet.feeTreasury);
    }

    /**********************************************************************************************/
    /*** UUPS and other functionalities                                                         ***/
    /**********************************************************************************************/

    function version() external pure returns (uint256) {
        return 1;
    }

    function _subnetExists(bytes32 subnetId_) private view returns (bool) {
        return subnets[subnetId_].owner != address(0);
    }

    function _authorizeUpgrade(address) internal view override onlyOwner {}
}
