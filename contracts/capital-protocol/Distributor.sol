// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import {PRECISION} from "@solarity/solidity-lib/utils/Globals.sol";

import {LinearDistributionIntervalDecrease} from "../libs/LinearDistributionIntervalDecrease.sol";

import {IDepositPool, IERC165} from "../interfaces/capital-protocol/IDepositPool.sol";
import {IChainLinkDataConsumerV3} from "../interfaces/capital-protocol/chainlink/IChainLinkDataConsumerV3.sol";

import {IPool as AaveIPool} from "@aave/core-v3/contracts/interfaces/IPool.sol";
import {IPoolDataProvider as AaveIPoolDataProvider} from "@aave/core-v3/contracts/interfaces/IPoolDataProvider.sol";

contract Distributor is OwnableUpgradeable, UUPSUpgradeable {
    struct DepositPool {
        address poolContract;
        address depositToken;
        string chainLinkPath;
        uint256 depositTokenPrice;
        address aToken;
        // uint256 rate;
        uint256 deposited;
    }

    struct DepositPools {
        // uint256 rate;
        uint256 deposited;
    }

    struct RewardPool {
        uint128 payoutStart;
        uint128 decreaseInterval;
        uint256 initialReward;
        uint256 rewardDecrease;
    }

    address public chainLinkDataConsumerV3;
    address public aavePool;
    address public aavePoolDataProvider;

    RewardPool[] public rewardPools;

    address[] public depositPoolAddresses;
    DepositPools public depositPools;
    mapping(address => DepositPool) public depositPools;

    constructor() {
        _disableInitializers();
    }

    function Distributor_init(address chainLinkDataConsumerV3_) external initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();

        setChainLinkDataConsumerV3(chainLinkDataConsumerV3_);
    }

    // function supportsInterface(bytes4 interfaceId_) external pure returns (bool) {
    //     return interfaceId_ == type(IBuildersTreasury).interfaceId || interfaceId_ == type(IERC165).interfaceId;
    // }

    /**********************************************************************************************/
    /*** Global contract management functionality for the contract `owner()`                    ***/
    /**********************************************************************************************/

    function setChainLinkDataConsumerV3(address value_) public onlyOwner {
        require(
            IERC165(value_).supportsInterface(type(IChainLinkDataConsumerV3).interfaceId),
            "DR: invalid data consumer"
        );

        chainLinkDataConsumerV3 = value_;
    }

    function setAavePool(address value_) public onlyOwner {
        require(value_ != address(0), "DR: invalid Aave pool address");

        aavePool = value_;
    }

    function setAavePoolDataProvider(address value_) public onlyOwner {
        require(value_ != address(0), "DR: invalid Aave pool data provider address");

        aavePoolDataProvider = value_;
    }

    /**********************************************************************************************/
    /*** `DepositPoolDetails` management functionality for the contract `owner()`               ***/
    /**********************************************************************************************/

    function addDepositPool(address poolContract_, string memory chainLinkPath_) external onlyOwner {
        require(
            IERC165(poolContract_).supportsInterface(type(IDepositPool).interfaceId),
            "DR: invalid capital contract address"
        );

        address depositToken_ = IDepositPool(poolContract_).depositToken();
        (address aToken_, , ) = AaveIPoolDataProvider(aavePoolDataProvider).getReserveTokensAddresses(depositToken_);

        depositPools memory depositPool_ = depositPools(poolContract_, depositToken_, chainLinkPath_, 0, aToken_);

        depositPoolAddresses.push(poolContract_);
        depositPools[poolContract_] = depositPool_;

        updateDepositTokensPrices();
    }

    function updateDepositTokensPrices() public {
        uint256 length_ = depositPoolAddresses.length;
        IChainLinkDataConsumerV3 chainLinkDataConsumerV3_ = IChainLinkDataConsumerV3(chainLinkDataConsumerV3);

        for (uint256 i = 0; i < length_; i++) {
            address depositPoolAddress = depositPoolAddresses[i];
            bytes32 chainLinkPathId = chainLinkDataConsumerV3_.getPathId(
                depositPools[depositPoolAddress].chainLinkPath
            );
            uint256 price_ = chainLinkDataConsumerV3_.getChainLinkDataFeedLatestAnswer(chainLinkPathId);

            require(price_ > 0, "DR: price for pair is zero");
            depositPools[depositPoolAddress].depositTokenPrice = price_;
        }
    }

    /**********************************************************************************************/
    /*** Reward pools management for the all deposit pools                                      ***/
    /**********************************************************************************************/

    function createRewardPools(RewardPool[] calldata rewardPools_) public onlyOwner {
        for (uint256 i = 0; i < rewardPools_.length; i++) {
            require(rewardPools_[i].decreaseInterval > 0, "DR: invalid decrease interval");

            rewardPools.push(rewardPools_[i]);
        }
    }

    function getRewardPool(uint256 rewardPoolIndex_) public view returns (RewardPool memory) {
        return rewardPools[rewardPoolIndex_];
    }

    function getRewardsFromRewardPool(
        uint256 rewardPoolIndex_,
        uint128 from_,
        uint128 to_
    ) public view returns (uint256) {
        if (rewardPoolIndex_ >= rewardPools.length) {
            return 0;
        }

        RewardPool storage rewardPool = rewardPools[rewardPoolIndex_];

        return
            LinearDistributionIntervalDecrease.getPeriodReward(
                rewardPool.initialReward,
                rewardPool.rewardDecrease,
                rewardPool.payoutStart,
                rewardPool.decreaseInterval,
                from_,
                to_
            );
    }

    function onlyExistedRewardPool(uint256 rewardPoolIndex_) public view {
        require(isRewardPoolExist(rewardPoolIndex_), "DR: reward pool doesn't exist");
    }

    function isRewardPoolExist(uint256 rewardPoolIndex_) public view returns (bool) {
        return rewardPoolIndex_ < rewardPools.length;
    }

    /**********************************************************************************************/
    /*** Aave                                                                                   ***/
    /**********************************************************************************************/

    function supplyToAave(uint256 amount_) external {
        address depositPoolAddress = _msgSender();
        DepositPool storage depositPool = depositPools[depositPoolAddress];

        AaveIPool(aavePool).supply(depositPool.depositToken, amount_, address(this), 0);
    }

    /**********************************************************************************************/
    /*** UUPS                                                                                   ***/
    /**********************************************************************************************/

    function version() external pure returns (uint256) {
        return 1;
    }

    function _authorizeUpgrade(address) internal view override onlyOwner {}
}
