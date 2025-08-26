// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {PRECISION} from "@solarity/solidity-lib/utils/Globals.sol";

import {IFeeConfig} from "../interfaces/builder-protocol/IFeeConfig.sol";
import {IBuildersV4, IERC165} from "../interfaces/builder-protocol/IBuildersV4.sol";
import {IBuildersTreasuryV2} from "../interfaces/builder-protocol/IBuildersTreasuryV2.sol";
import {IRewardPool} from "../interfaces/IRewardPool.sol";

contract BuildersV4 is IBuildersV4, UUPSUpgradeable, OwnableUpgradeable {
    using Math for *;
    using SafeERC20 for IERC20;

    /** @dev The `FeeConfig` contract address */
    address public feeConfig;

    /** @dev The `BuildersTreasury` contract address */
    address public buildersTreasury;

    /** @dev The deposit (stake) token address (MOR) */
    address public depositToken;

    /**
     * @dev Old `editPoolDeadline`
     * v4 update, this functionality removed.
     */
    uint128 public unusedStorage1_V4Update;

    /**
     * @dev After the `deposit()`, the user can't `withdraw()`
     * their funds for the `minimalWithdrawLockPeriod` seconds.
     */
    uint256 public minimalWithdrawLockPeriod;

    /** @dev Contain global information for all Subnets */
    AllSubnetsData public allSubnetsData;

    /** @dev Contain information about Subnets */
    mapping(bytes32 subnetId => Subnet) public subnets;

    /** @dev Contain internal information about Subnets */
    mapping(bytes32 subnetId => SubnetData) public subnetsData;

    /** @dev Contain information about the stakers for each Subnet */
    mapping(address user => mapping(bytes32 subnetId => UserData)) public usersData;

    /** @dev Removed in V4, we will not use `FEE_WITHDRAW_OPERATION` */
    // bytes32 private constant FEE_WITHDRAW_OPERATION = "withdraw";

    /** @dev Contain the `operation` label for the `FeeConfig` contract. */
    bytes32 public constant FEE_CLAIM_OPERATION = "claim";

    /**
     * @dev UPGRADE `BuildersV4` storage updates, refactor calculation logic,
     * Update Subnets creation logic, and add Subnet metadata. Add network share.
     */

    /** @dev The `RewardPool`contract address */
    address public rewardPool;

    /**  @dev `subnetCreationFeeAmount` is taken from the `_msgSender()` when the Subnet created */
    uint256 public subnetCreationFeeAmount;

    /**
     * @dev The `networkShare` is the share of the network rewards that will be distributed to Subnets,
     * e.g. 100% = 1e25. If global reward curve return `X` amount of rewards, then all Subnets will
     * receive `X * networkShare / 1e25`
     */
    uint256 public networkShare;

    /**  @dev The `networkShareOwner` address can change the `networkShare` value. */
    address public networkShareOwner;

    /** @dev Contain the metadata about Subnets */
    mapping(bytes32 subnetId => SubnetMetadata) public subnetsMetadata;

    /** @dev Contain global additional information for all Subnets */
    AllSubnetsDataV4 public allSubnetsDataV4;

    /** @dev Contain the `operation` label for the `FeeConfig` contract. */
    bytes32 public constant FEE_SUBNET_CREATE = "buildersV4.fee.subnet.create";
    /** @dev UPGRADE `BuildersV4` end. */

    modifier onlyExistedSubnet(bytes32 subnetId_) {
        require(_isSubnetExist(subnetId_), "BU: the Subnet doesn't exist");
        _;
    }

    modifier onlySubnetOwner(bytes32 subnetId_) {
        require(_msgSender() == subnets[subnetId_].admin, "BU: not the Subnet owner");
        _;
    }

    constructor() {
        _disableInitializers();
    }

    function BuildersV4_init(
        address depositToken_,
        address feeConfig_,
        address treasury_,
        address rewardPool_,
        address networkShareOwner_,
        uint256 minimalWithdrawLockPeriod_
    ) external initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();

        setFeeConfig(feeConfig_);
        setBuildersTreasury(treasury_);
        setMinimalWithdrawLockPeriod(minimalWithdrawLockPeriod_);
        setRewardPool(rewardPool_);
        setNetworkShareOwner(networkShareOwner_);
        depositToken = depositToken_;
    }

    function supportsInterface(bytes4 interfaceId_) external pure returns (bool) {
        return interfaceId_ == type(IBuildersV4).interfaceId || interfaceId_ == type(IERC165).interfaceId;
    }

    /**********************************************************************************************/
    /*** Global contract management functionality for the contract `owner()`                    ***/
    /**********************************************************************************************/

    function setFeeConfig(address feeConfig_) public onlyOwner {
        require(IERC165(feeConfig_).supportsInterface(type(IFeeConfig).interfaceId), "BU: invalid fee config");

        feeConfig = feeConfig_;

        emit FeeConfigSet(feeConfig_);
    }

    function setBuildersTreasury(address treasury_) public onlyOwner {
        require(
            IERC165(treasury_).supportsInterface(type(IBuildersTreasuryV2).interfaceId),
            "BU: invalid builders treasury"
        );

        buildersTreasury = treasury_;

        emit BuildersTreasurySet(treasury_);
    }

    function setMinimalWithdrawLockPeriod(uint256 minimalWithdrawLockPeriod_) public onlyOwner {
        minimalWithdrawLockPeriod = minimalWithdrawLockPeriod_;

        emit MinimalWithdrawLockPeriodSet(minimalWithdrawLockPeriod_);
    }

    function setRewardPool(address rewardPool_) public onlyOwner {
        require(
            IERC165(rewardPool_).supportsInterface(type(IRewardPool).interfaceId),
            "BU: invalid reward pool address"
        );

        rewardPool = rewardPool_;

        emit RewardPoolSet(rewardPool_);
    }

    function setNetworkShareOwner(address networkShareOwner_) public onlyOwner {
        require(networkShareOwner_ != address(0), "BU: cannot set zero address as owner");

        networkShareOwner = networkShareOwner_;

        emit NetworkShareOwnerSet(networkShareOwner_);
    }

    function setNetworkShare(uint256 networkShare_) external {
        require(_msgSender() == networkShareOwner || _msgSender() == owner(), "BU: invalid caller");
        require(networkShare_ <= PRECISION && networkShare_ > 0, "BU: invalid share");

        _updatePoolData(bytes32(0), address(0), 0);

        networkShare = networkShare_;

        emit NetworkShareSet(networkShare_);
    }

    function setSubnetCreationFeeAmount(uint256 subnetCreationFeeAmount_) external onlyOwner {
        subnetCreationFeeAmount = subnetCreationFeeAmount_;

        emit SubnetCreationFeeAmountSet(subnetCreationFeeAmount_);
    }

    /**********************************************************************************************/
    /*** Subnets management                                                                     ***/
    /**********************************************************************************************/

    function createSubnet(Subnet calldata subnet_, SubnetMetadata calldata metadata_) public {
        bytes32 subnetId_ = getSubnetId(subnet_.name);
        bytes32 oldSubnetId_ = getSubnetIdOld(subnet_.name);

        require(!_isSubnetExist(subnetId_), "BU: the Subnet already exist (1)");
        require(!_isSubnetExist(oldSubnetId_), "BU: the Subnet already exist (2)");

        _validateSubnet(subnet_);

        if (subnetCreationFeeAmount > 0) {
            (, address treasury_) = IFeeConfig(feeConfig).getFeeAndTreasuryForOperation(
                address(this),
                FEE_SUBNET_CREATE
            );
            IERC20(depositToken).safeTransferFrom(_msgSender(), treasury_, subnetCreationFeeAmount);

            emit FeePaid(_msgSender(), FEE_SUBNET_CREATE, subnetCreationFeeAmount, treasury_);
        }

        subnets[subnetId_] = subnet_;
        _editSubnetMetadata(subnetId_, metadata_);

        emit SubnetCreated(subnetId_, subnet_);
    }

    function editSubnet(bytes32 subnetId_, Subnet calldata newSubnet_) external onlySubnetOwner(subnetId_) {
        _validateSubnet(newSubnet_);

        Subnet storage subnet = subnets[subnetId_];
        require(keccak256(bytes(newSubnet_.name)) == keccak256(bytes(subnet.name)), "BU: the name can't be changed");

        subnets[subnetId_] = newSubnet_;

        emit SubnetEdited(subnetId_, newSubnet_);
    }

    function editSubnetMetadata(
        bytes32 subnetId_,
        SubnetMetadata calldata metadata_
    ) public onlySubnetOwner(subnetId_) {
        _editSubnetMetadata(subnetId_, metadata_);
    }

    function _editSubnetMetadata(bytes32 subnetId_, SubnetMetadata calldata metadata_) private {
        subnetsMetadata[subnetId_] = metadata_;

        emit SubnetMetadataEdited(subnetId_, metadata_);
    }

    function _validateSubnet(Subnet calldata subnet_) internal view {
        require(bytes(subnet_.name).length != 0, "BU: invalid project name");
        require(subnet_.admin != address(0), "BU: invalid admin address");
        require(subnet_.claimAdmin != address(0), "BU: invalid claim admin address");
        require(
            subnet_.withdrawLockPeriodAfterDeposit >= minimalWithdrawLockPeriod,
            "BU: invalid withdraw lock period"
        );
    }

    /**
     * @dev Get the Subnet ID by the `subnetName_` and the current `block.chainid`.
     * All Subnets in V4 will have new IDs.
     */
    function getSubnetId(string memory subnetName_) public view returns (bytes32) {
        return keccak256(abi.encodePacked(block.chainid, subnetName_));
    }

    /**
     * @dev Get the Subnet ID by the `subnetName_`. We keep this function for backward
     * compatibility.
     */
    function getSubnetIdOld(string memory subnetName_) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(subnetName_));
    }

    /**
     * @dev Check if the Subnet with the given `subnetId_` exists.
     */
    function _isSubnetExist(bytes32 subnetId_) private view returns (bool) {
        return subnets[subnetId_].admin != address(0);
    }

    /**********************************************************************************************/
    /*** Functionality for the users (Stakers)                                                  ***/
    /**********************************************************************************************/

    function deposit(bytes32 subnetId_, uint256 amount_) external onlyExistedSubnet(subnetId_) {
        require(amount_ > 0, "BU: amount must be greater than zero");
        address user_ = _msgSender();

        Subnet storage subnet = subnets[subnetId_];
        UserData storage userData = usersData[user_][subnetId_];

        uint256 deposited_ = userData.deposited + amount_;
        require(deposited_ >= subnet.minimalDeposit, "BU: amount too low");

        IERC20(depositToken).safeTransferFrom(_msgSender(), address(this), amount_);

        // Storage modification
        _updatePoolData(subnetId_, user_, deposited_);
        userData.lastDeposit = uint128(block.timestamp);

        emit UserDeposited(subnetId_, user_, amount_);
    }

    function withdraw(bytes32 subnetId_, uint256 amount_) external onlyExistedSubnet(subnetId_) {
        address user_ = _msgSender();

        Subnet storage subnet = subnets[subnetId_];
        UserData storage userData = usersData[user_][subnetId_];

        if (amount_ > userData.deposited) {
            amount_ = userData.deposited;
        }
        require(amount_ > 0, "BU: nothing to withdraw");

        require(
            block.timestamp > userData.lastDeposit + subnet.withdrawLockPeriodAfterDeposit,
            "BU: user withdraw is locked"
        );

        uint256 deposited_ = userData.deposited - amount_;
        require(deposited_ >= subnet.minimalDeposit || deposited_ == 0, "BU: invalid withdraw amount");

        // Storage modification
        _updatePoolData(subnetId_, user_, deposited_);

        IERC20(depositToken).safeTransfer(user_, amount_);

        emit UserWithdrawn(subnetId_, user_, amount_);
    }

    function claim(bytes32 subnetId_, address receiver_) external onlyExistedSubnet(subnetId_) {
        address user_ = _msgSender();

        Subnet storage subnet = subnets[subnetId_];
        require(user_ == subnet.admin || user_ == subnet.claimAdmin, "BU: invalid caller");

        _updatePoolData(subnetId_, address(0), 0); // Storage modification

        SubnetData storage subnetData = subnetsData[subnetId_];
        uint256 pendingRewards_ = subnetData.pendingRewards;
        require(pendingRewards_ > 0, "BU: nothing to claim");
        subnetData.pendingRewards = 0; // Storage modification
        allSubnetsDataV4.claimedRewards += pendingRewards_;

        // Transfer `feeAmount_` to the `treasuryAddress_` from the `pendingRewards_`
        (uint256 feeAmount_, address treasuryAddress_) = _getFee(pendingRewards_, FEE_CLAIM_OPERATION);
        if (feeAmount_ > 0) {
            IBuildersTreasuryV2(buildersTreasury).sendRewards(treasuryAddress_, feeAmount_);
            pendingRewards_ -= feeAmount_;

            emit FeePaid(user_, FEE_CLAIM_OPERATION, feeAmount_, treasuryAddress_);
        }
        // Transfer the rest of the `pendingRewards_` to the `receiver_`
        IBuildersTreasuryV2(buildersTreasury).sendRewards(receiver_, pendingRewards_);

        emit AdminClaimed(subnetId_, receiver_, pendingRewards_);
    }

    /**
     * @dev Update the global data for Subnets, the Subnet internal data and user data after
     * the deposit, withdraw or claim.
     * Additional storage updates may be required depending on the logic of the root function.
     * On `claim()` the `newDeposited_` is always 0, the `user_` is always zero address. We
     * repeat the same logic to update the contract storage.
     */
    function _updatePoolData(bytes32 subnetId_, address user_, uint256 newDeposited_) internal {
        SubnetData storage subnetData = subnetsData[subnetId_];
        UserData storage userData = usersData[user_][subnetId_];

        (uint256 currentRate_, uint256 rewardForSubnets_) = _getCurrentRate();
        uint256 pendingRewards_ = _getCurrentSubnetRewards(currentRate_, subnetData);

        // Update all Subnets data
        if (currentRate_ == allSubnetsData.rate) {
            allSubnetsDataV4.undistributedRewards += rewardForSubnets_;
        } else {
            allSubnetsDataV4.distributedRewards += rewardForSubnets_;
        }
        allSubnetsData.rate = currentRate_;
        allSubnetsData.totalDeposited = allSubnetsData.totalDeposited + newDeposited_ - userData.deposited;
        allSubnetsDataV4.lastUpdate = uint128(block.timestamp);

        // Update the Subnet data
        subnetData.rate = currentRate_;
        subnetData.pendingRewards = pendingRewards_;
        subnetData.deposited = subnetData.deposited + newDeposited_ - userData.deposited;

        // Update the user data
        userData.deposited = newDeposited_;
    }

    /**
     * @dev Return the current reward rate for the Subnets and the rewards for Subnets.
     * @return rate_ The current rate for the Subnets.
     * @return rewardForSubnets_ The rewards for Subnets since the last update (`allSubnetsData.lastUpdate`).
     */
    function _getCurrentRate() private view returns (uint256, uint256) {
        uint128 from_ = allSubnetsDataV4.lastUpdate;
        if (from_ == 0) {
            from_ = uint128(block.timestamp);
        }
        uint256 rewardPoolId = 3; // The ID for the Builder bucket in the `RewardPool` contract.
        uint256 rewardForSubnetsRaw_ = IRewardPool(rewardPool).getPeriodRewards(
            rewardPoolId,
            from_,
            uint128(block.timestamp)
        );
        uint256 rewardForSubnets_ = rewardForSubnetsRaw_.mulDiv(networkShare, PRECISION, Math.Rounding.Down);

        if (allSubnetsData.totalDeposited == 0) {
            return (allSubnetsData.rate, rewardForSubnets_);
        }

        uint256 rate_ = allSubnetsData.rate +
            rewardForSubnets_.mulDiv(PRECISION, allSubnetsData.totalDeposited, Math.Rounding.Down);

        return (rate_, rewardForSubnets_);
    }

    /**********************************************************************************************/
    /*** Functionality for receiving latest Subnet(s) reward                                    ***/
    /**********************************************************************************************/

    function getCurrentSubnetsRewards() external view returns (uint256) {
        (uint256 currentRate_, uint256 rewardForSubnets_) = _getCurrentRate();
        if (currentRate_ == allSubnetsData.rate) {
            return allSubnetsDataV4.distributedRewards - allSubnetsDataV4.claimedRewards;
        }

        return allSubnetsDataV4.distributedRewards + rewardForSubnets_ - allSubnetsDataV4.claimedRewards;
    }

    function getCurrentSubnetRewards(bytes32 subnetId_) external view returns (uint256) {
        if (!_isSubnetExist(subnetId_)) return 0;

        (uint256 currentRate_, ) = _getCurrentRate();

        return _getCurrentSubnetRewards(currentRate_, subnetsData[subnetId_]);
    }

    /**
     * @dev Get the current rewards for the given `subnetData_` and `currentRate_`.
     * The `currentRate_` is the rate of the Subnet at the moment of the call.
     */
    function _getCurrentSubnetRewards(
        uint256 currentRate_,
        SubnetData memory subnetData_
    ) internal pure returns (uint256) {
        uint256 rewardForSubnet_ = (currentRate_ - subnetData_.rate).mulDiv(
            subnetData_.deposited,
            PRECISION,
            Math.Rounding.Down
        );

        return subnetData_.pendingRewards + rewardForSubnet_;
    }

    /**********************************************************************************************/
    /*** Internal functionality for receiving information about the fees                        ***/
    /**********************************************************************************************/

    /**
     * @dev Get the fee amount and the treasury address for the given `amount_` and `operation_`
     * using the `FeeConfig` contract.
     */
    function _getFee(uint256 amount_, bytes32 operation_) internal view returns (uint256, address) {
        (uint256 feePart_, address treasuryAddress_) = IFeeConfig(feeConfig).getFeeAndTreasuryForOperation(
            address(this),
            operation_
        );

        uint256 fee_ = amount_.mulDiv(feePart_, PRECISION, Math.Rounding.Down);

        return (fee_, treasuryAddress_);
    }

    /**********************************************************************************************/
    /*** UUPS functionality                                                                     ***/
    /**********************************************************************************************/

    function version() external pure returns (uint256) {
        return 4;
    }

    function _authorizeUpgrade(address) internal view override onlyOwner {}
}
