// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {IReferrer} from "./IReferrer.sol";

/**
 * @title IDistributor
 * @notice Defines the basic interface for the Distributor
 */
interface IDistributor is IERC165 {
    event ChainLinkDataConsumerSet(address chainLinkDataConsumer);
    event L1SenderSet(address l1Sender);
    event AavePoolSet(address aavePool);
    event AavePoolDataProviderSet(address aavePoolDataProvider);
    event RewardPoolSet(address rewardPool);
    event MinRewardsDistributePeriodSet(uint256 minRewardsDistributePeriod);
    event RewardPoolLastCalculatedTimestampSet(uint256 rewardPoolIndex_, uint128 rewardPoolLastCalculatedTimestamp);
    event DepositPoolAdded(uint256 rewardPoolIndex, DepositPool depositPool);
    event TokenPriceSet(string chainLinkPath, uint256 price);

    /**
     * @notice The Yield strategy.
     * NONE - for tokens without yield strategy (stETH).
     * NO_YIELD - for virtual tokens in the private pools.
     * AAVE - fot tokens with Aave yield strategy.
     */
    enum Strategy {
        NONE,
        NO_YIELD,
        AAVE
    }

    /**
     * @notice The struct that stores the DepositPool data.
     * @param token The yield token (stETH, wBTC...).
     * @param chainLinkPath The path from `ChainLinkDataConsumer`.
     * @param tokenPrice The last calculated token price. Used for internal calculations.
     * @param deposited The deposited `token` amount.
     * @param lastUnderlyingBalance The last calculated balance that include the `yield`.
     * @param strategy The `Strategy`.
     * @param aToken The `aToken` address for the pools with `AAVE` strategy. Zero for other.
     * @param isExist The existed flag. Should be true id deposit pool added.
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

    /**
     * @notice The function to receive the `ChainLinkDataConsumer` contract address.
     * @return The `ChainLinkDataConsumer` contract address.
     */
    function chainLinkDataConsumer() external view returns (address);

    /**
     * @notice The function to receive the `RewardPool` contract address.
     * @return The `RewardPool` contract address.
     */
    function rewardPool() external view returns (address);

    /**
     * @notice The function to receive the `L1SenderV2` contract address.
     * @return The `L1SenderV2` contract address.
     */
    function l1Sender() external view returns (address);

    /**
     * @notice The function to receive the Aave `Pool` contract address.
     * @return The Aave `Pool` contract address.
     */
    function aavePool() external view returns (address);

    /**
     * @notice The function to receive the Aave `AaveProtocolDataProvider` contract address.
     * @return The Aave `AaveProtocolDataProvider` contract address.
     */
    function aavePoolDataProvider() external view returns (address);

    /**
     * @notice The function to receive the undistributed reward.
     * @return The undistributed reward.
     */
    function undistributedRewards() external view returns (uint256);

    /**
     * @notice The function to receive the minimal rewards distribute period.
     * @dev Accrual of rewards is done in intervals, the minimum interval is stored here.
     * @return The minimal rewards distribute period
     */
    function minRewardsDistributePeriod() external view returns (uint256);

    /**
     * @notice The function to set the `ChainLinkDataConsumer` contract.
     * @dev Only for the contract `owner()`.
     * @param value_ The `ChainLinkDataConsumer` address.
     */
    function setChainLinkDataConsumer(address value_) external;

    /**
     * @notice The function to set the Aave `Pool` contract.
     * @dev Only for the contract `owner()`.
     * @param value_ The Aave `Pool` address.
     */
    function setAavePool(address value_) external;

    /**
     * @notice The function to set the `AavePoolDataProvider` contract.
     * @dev Only for the contract `owner()`.
     * @param value_ The `AavePoolDataProvider` address.
     */
    function setAavePoolDataProvider(address value_) external;

    /**
     * @notice The function to set the `RewardPool` contract.
     * @dev Only for the contract `owner()`.
     * @param value_ The `RewardPool` address.
     */
    function setRewardPool(address value_) external;

    /**
     * @notice The function to add new `DepositPool`.
     * @dev Only for the contract `owner()`.
     * @param rewardPoolIndex_ The reward pool index.
     * @param depositPoolAddress_ The `DepositPool` contract address.
     * @param token_ The yield token for the `DepositPool` contract.
     * @param chainLinkPath_ The path from the `ChainLinkDataConsumer`.
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
     * @notice The function to update the token prices.
     * @param rewardPoolIndex_ The reward pool index.
     */
    function updateDepositTokensPrices(uint256 rewardPoolIndex_) external;

    /**
     * @notice The function to get the distributed rewards.
     * @param rewardPoolIndex_ The reward pool index.
     * @param depositPoolAddress_ The `DepositPool` contract address.
     * @return Distributed rewards amount.
     */
    function getDistributedRewards(
        uint256 rewardPoolIndex_,
        address depositPoolAddress_
    ) external view returns (uint256);

    /**
     * @notice The function to supply tokens to the contract.
     * @dev Only for deposit pools
     * @param rewardPoolIndex_ The reward pool index.
     * @param amount_ The token amount.
     */
    function supply(uint256 rewardPoolIndex_, uint256 amount_) external;

    /**
     * @notice The function to withdraw tokens from the contract.
     * @dev Only for deposit pools
     * @param rewardPoolIndex_ The reward pool index.
     * @param amount_ The token amount.
     */
    function withdraw(uint256 rewardPoolIndex_, uint256 amount_) external returns (uint256);

    /**
     * @notice The function to distribute rewards based on the tokens yield.
     * @param rewardPoolIndex_ The reward pool index.
     */
    function distributeRewards(uint256 rewardPoolIndex_) external;

    /**
     * The function to withdraw the yield.
     * @param rewardPoolIndex_ The reward pool index.
     * @param depositPoolAddress_ The `DepositPool` contract address.
     */
    function withdrawYield(uint256 rewardPoolIndex_, address depositPoolAddress_) external;

    /**
     * @notice The function to withdraw undistributed rewards.
     * @dev Only for the contract `owner()`.
     * @param user_ The rewards receiver address.
     * @param refundTo_ The address to refund the overpaid gas.
     */
    function withdrawUndistributedRewards(address user_, address refundTo_) external payable;

    /**
     * @notice The function to send the reward token mint message to the `L1SenderV2`.
     * @param rewardPoolIndex_ The reward pool index.
     * @param user_ The user's address receiver .
     * @param amount_ The amount of reward token to mint.
     * @param refundTo_ The address to refund the overpaid gas.
     */
    function sendMintMessage(
        uint256 rewardPoolIndex_,
        address user_,
        uint256 amount_,
        address refundTo_
    ) external payable;

    /**
     * @notice The function to get the contract version.
     * @return The current contract version
     */
    function version() external pure returns (uint256);
}
