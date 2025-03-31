// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

import {IReferrer} from "./IReferrer.sol";

interface IDistributor is IERC165 {
    /**
     * @dev Yield strategy.
     * NONE - for tokens without yield strategy.
     * NO_YIELD - for tokens without yield.
     * AAVE - fot Aave yield strategy.
     */
    enum Strategy {
        NONE,
        NO_YIELD,
        AAVE
    }

    /**
     * @param depositPoolAddress The `DepositPool` contract address.
     * @param token The yield token.
     * @param chainLinkPath The path for `ChainLinkDataConsumer`.
     * @param tokenPrice The token price, filled by the contract.
     * @param deposited The deposited yield token amount.
     * @param lastUnderlyingBalance The last calculate balance after thr yield.
     * @param strategy The `Strategy`.
     * @param aToken The `token` address after the deposit to Aave.
     * @param isExist The existed flag.

     */
    struct DepositPool {
        address token;
        string chainLinkPath;
        uint256 tokenPrice;
        uint256 deposited;
        uint256 lastUnderlyingBalance;
        Strategy strategy;
        address aToken;
        bool isExist;
    }

    event ChainLinkDataConsumerSet(address chainLinkDataConsumer);
    event L1SenderSet(address l1Sender);
    event AavePoolSet(address aavePool);
    event AavePoolDataProviderSet(address aavePoolDataProvider);
    event RewardPoolSet(address rewardPool);
    event MinRewardsDistributePeriodSet(uint256 minRewardsDistributePeriod);
    event RewardPoolLastCalculatedTimestampSet(uint256 rewardPoolIndex_, uint128 rewardPoolLastCalculatedTimestamp);
    event DepositPoolAdded(uint256 rewardPoolIndex, DepositPool depositPool);

    /**
     * The function to return `RewardPool` contract address.
     */
    function rewardPool() external view returns (address);

    /**
     * The function to set the `ChainLinkDataConsumer` contract.
     * @param value_ The `ChainLinkDataConsumer` address.
     */
    function setChainLinkDataConsumer(address value_) external;

    /**
     * The function to set the `AavePool` contract.
     * @param value_ The `AavePool` address.
     */
    function setAavePool(address value_) external;

    /**
     * The function to set the `AavePoolDataProvider` contract.
     * @param value_ The `AavePoolDataProvider` address.
     */
    function setAavePoolDataProvider(address value_) external;

    /**
     * The function to set the `RewardPool` contract.
     * @param value_ The `RewardPool` address.
     */
    function setRewardPool(address value_) external;

    /**
     * The function to add new `DepositPool`.
     * @param rewardPoolIndex_ The reward pool index.
     * @param depositPoolAddress_ The `DepositPool` contract address.
     * @param token_ The yield token contract address.
     * @param chainLinkPath_ The path for `ChainLinkDataConsumer`.
     * @param strategy_ The `Strategy`.
     */
    function addDepositPool(
        uint256 rewardPoolIndex_,
        address depositPoolAddress_,
        address token_,
        string memory chainLinkPath_,
        Strategy strategy_
    ) external;

    /**
     * The function to update token prices.
     * @param rewardPoolIndex_ The reward pool index.
     */
    function updateDepositTokensPrices(uint256 rewardPoolIndex_) external;

    /**
     * The function to get distributed rewards.
     * @param rewardPoolIndex_ The reward pool index.
     * @param depositPoolAddress_ The `DepositPool` contract address.
     */
    function getDistributedRewards(
        uint256 rewardPoolIndex_,
        address depositPoolAddress_
    ) external view returns (uint256);

    /**
     * The function to supply for yield.
     * @param rewardPoolIndex_ The reward pool index.
     * @param amount_ The token amount.
     */
    function supply(uint256 rewardPoolIndex_, uint256 amount_) external;

    /**
     * The function to withdraw from yield strategy.
     * @param rewardPoolIndex_ The reward pool index.
     * @param amount_ The token amount.
     */
    function withdraw(uint256 rewardPoolIndex_, uint256 amount_) external returns (uint256);

    /**
     * The function to distribute rewards.
     * @param rewardPoolIndex_ The reward pool index.
     */
    function distributeRewards(uint256 rewardPoolIndex_) external;

    /**
     * The function to withdraw yield.
     * @param rewardPoolIndex_ The reward pool index.
     * @param depositPoolAddress_ The `DepositPool` contract address.
     */
    function withdrawYield(uint256 rewardPoolIndex_, address depositPoolAddress_) external;

    /**
     * The function to send the message of mint of reward token to the `L1SenderV2`.
     * @param rewardPoolIndex_ The reward pool index.
     * @param user_ The user's address to mint reward tokens.
     * @param amount_ The amount of reward tokens to mint.
     * @param refundTo_ The address to refund the overpaid gas.
     */
    function sendMintMessage(
        uint256 rewardPoolIndex_,
        address user_,
        uint256 amount_,
        address refundTo_
    ) external payable;

    /**
     * The function to get the contract version.
     */
    function version() external pure returns (uint256);
}
