// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

import {IReferrer} from "./IReferrer.sol";

interface IDistributor is IERC165 {
    enum Strategy {
        NONE,
        NO_YIELD,
        AAVE
    }

    struct DepositPool {
        // DepositPool contract storage
        address depositPoolAddress;
        address token;
        // ChainLink storage
        string chainLinkPath;
        uint256 tokenPrice;
        // Calculations
        uint256 deposited;
        uint256 lastUnderlyingBalance;
        Strategy strategy;
        address aToken;
        // Gap for future strategies
        uint256[10] __gap;
    }

    event ChainLinkDataConsumerSet(address chainLinkDataConsumer);
    event L1SenderSet(address l1Sender);
    event AavePoolSet(address aavePool);
    event AavePoolDataProviderSet(address aavePoolDataProvider);
    event RewardPoolSet(address rewardPool);
    event MinRewardsDistributePeriodSet(uint256 minRewardsDistributePeriod);
    event RewardPoolLastCalculatedTimestampSet(uint256 rewardPoolIndex_, uint128 rewardPoolLastCalculatedTimestamp);
    event DepositPoolAdded(uint256 rewardPoolIndex, DepositPool depositPool);

    function rewardPool() external view returns (address);

    function setChainLinkDataConsumer(address value_) external;

    function setAavePool(address value_) external;

    function setAavePoolDataProvider(address value_) external;

    function setRewardPool(address value_) external;

    function addDepositPool(
        uint256 rewardPoolIndex_,
        address depositPoolAddress_,
        address depositToken_,
        string memory chainLinkPath_,
        Strategy strategy_
    ) external;

    function updateDepositTokensPrices(uint256 rewardPoolIndex_) external;

    function getDistributedRewards(
        uint256 rewardPoolIndex_,
        address depositPoolAddress_
    ) external view returns (uint256);

    function supply(uint256 rewardPoolIndex_, uint256 amount_) external;

    function withdraw(uint256 rewardPoolIndex_, uint256 amount_) external returns (uint256);

    function distributeRewards(uint256 rewardPoolIndex_) external;

    function withdrawYield(uint256 rewardPoolIndex_, address depositPoolAddress_) external;

    function sendMintMessage(
        uint256 rewardPoolIndex_,
        address user_,
        uint256 amount_,
        address refundTo_
    ) external payable;

    function version() external pure returns (uint256);
}
