// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {IPool as AaveIPool} from "@aave/core-v3/contracts/interfaces/IPool.sol";
import {IPoolDataProvider as AaveIPoolDataProvider} from "@aave/core-v3/contracts/interfaces/IPoolDataProvider.sol";

import {DecimalsConverter} from "@solarity/solidity-lib/libs/decimals/DecimalsConverter.sol";

import {IDistributor, IERC165} from "../interfaces/capital-protocol/IDistributor.sol";
import {IL1SenderV2} from "../interfaces/capital-protocol/IL1SenderV2.sol";
import {IChainLinkDataConsumer} from "../interfaces/capital-protocol/IChainLinkDataConsumer.sol";
import {IDepositPool} from "../interfaces/capital-protocol/IDepositPool.sol";
import {IRewardPool} from "../interfaces/capital-protocol/IRewardPool.sol";

contract Distributor is IDistributor, OwnableUpgradeable, UUPSUpgradeable {
    using SafeERC20 for IERC20;
    using DecimalsConverter for uint256;
    using Math for uint256;

    /** @dev `reward_pool_index` => `deposit_pool_address` => `DepositPool` */
    mapping(uint256 => mapping(address => DepositPool)) public depositPools;

    /** @dev `reward_pool_index` => `deposit_pool_address` => `rewards` */
    mapping(uint256 => mapping(address => uint256)) public distributedRewards;

    /** @dev `reward_pool_index` => `deposit_pool_addresses` */
    mapping(uint256 => address[]) public depositPoolAddresses;

    mapping(uint256 => uint128) public rewardPoolLastCalculatedTimestamp;
    mapping(uint256 => bool) public isPrivateDepositPoolAdded;

    /**
     * @dev The variable contain `ChainLinkDataConsumer` contract address.
     * Is used to obtain prices.
     */
    address public chainLinkDataConsumer;

    /**
     * @dev The variable contain `RewardPool` contract address.
     * Is used to obtain reward amount.
     */
    address public rewardPool;

    /**
     * @dev The variable contain `` contract address.
     * Used to send messages to the token's mint and yield transfer.
     */
    address public l1Sender;

    /**
     * @dev https://aave.com/docs/resources/addresses
     * See `Pool` and `AaveProtocolDataProvider`
     */
    address public aavePool;
    address public aavePoolDataProvider;

    /**
     * @dev This variable contain undistributed rewards, e.g. the situation
     * when the yield from all deposit pools are zero.
     */
    uint256 public undistributedRewards;

    uint256 public minRewardsDistributePeriod;

    /**********************************************************************************************/
    /*** Init, IERC165                                                                          ***/
    /**********************************************************************************************/

    constructor() {
        _disableInitializers();
    }

    function Distributor_init(
        address chainLinkDataConsumer_,
        address aavePool_,
        address aavePoolDataProvider_,
        address rewardPool_,
        address l1Sender_
    ) external initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();

        setChainLinkDataConsumer(chainLinkDataConsumer_);
        setAavePool(aavePool_);
        setAavePoolDataProvider(aavePoolDataProvider_);
        setRewardPool(rewardPool_);
        setL1Sender(l1Sender_);
    }

    function supportsInterface(bytes4 interfaceId_) external pure returns (bool) {
        return interfaceId_ == type(IDistributor).interfaceId || interfaceId_ == type(IERC165).interfaceId;
    }

    /**********************************************************************************************/
    /*** Global contract management functionality for the contract `owner()`                    ***/
    /**********************************************************************************************/

    function setChainLinkDataConsumer(address value_) public onlyOwner {
        require(
            IERC165(value_).supportsInterface(type(IChainLinkDataConsumer).interfaceId),
            "DR: invalid data consumer"
        );

        chainLinkDataConsumer = value_;

        emit ChainLinkDataConsumerSet(value_);
    }

    function setL1Sender(address value_) public onlyOwner {
        require(IERC165(value_).supportsInterface(type(IL1SenderV2).interfaceId), "DR: invalid L1Sender address");

        l1Sender = value_;

        emit L1SenderSet(value_);
    }

    /**
     * @dev https://aave.com/docs/resources/addresses. See `Pool`.
     */
    function setAavePool(address value_) public onlyOwner {
        require(value_ != address(0), "DR: invalid Aave pool address");

        aavePool = value_;

        emit AavePoolSet(value_);
    }

    /**
     * @dev https://aave.com/docs/resources/addresses. See `AaveProtocolDataProvider`.
     */
    function setAavePoolDataProvider(address value_) public onlyOwner {
        require(value_ != address(0), "DR: invalid Aave pool data provider address");

        aavePoolDataProvider = value_;

        emit AavePoolDataProviderSet(value_);
    }

    function setRewardPool(address value_) public onlyOwner {
        require(IERC165(value_).supportsInterface(type(IRewardPool).interfaceId), "DR: invalid reward pool address");

        rewardPool = value_;

        emit RewardPoolSet(value_);
    }

    function setMinRewardsDistributePeriod(uint256 value_) public onlyOwner {
        minRewardsDistributePeriod = value_;

        emit MinRewardsDistributePeriodSet(value_);
    }

    function setRewardPoolLastCalculatedTimestamp(uint256 rewardPoolIndex_, uint128 value_) public onlyOwner {
        IRewardPool(rewardPool).onlyExistedRewardPool(rewardPoolIndex_);
        require(value_ <= block.timestamp, "DR: invalid last calculated timestamp");

        rewardPoolLastCalculatedTimestamp[rewardPoolIndex_] = value_;

        emit RewardPoolLastCalculatedTimestampSet(rewardPoolIndex_, value_);
    }

    /**********************************************************************************************/
    /*** `DepositPoolDetails` management functionality                                          ***/
    /**********************************************************************************************/

    function addDepositPool(
        uint256 rewardPoolIndex_,
        address depositPoolAddress_,
        address token_,
        string memory chainLinkPath_,
        Strategy strategy_
    ) external onlyOwner {
        IRewardPool rewardPool_ = IRewardPool(rewardPool);
        rewardPool_.onlyExistedRewardPool(rewardPoolIndex_);

        require(
            IERC165(depositPoolAddress_).supportsInterface(type(IDepositPool).interfaceId),
            "DR: the deposit pool address is invalid"
        );

        // Validate that pool is public in other cases.
        if (strategy_ == Strategy.NO_YIELD) {
            // Validate that pool is private.
            rewardPool_.onlyNotPublicRewardPool(rewardPoolIndex_);
            // Validate that deposit pool is not added for this `rewardPoolIndex_`.
            require(
                depositPoolAddresses[rewardPoolIndex_].length == 0,
                "DR: the deposit pool for this index already added"
            );

            // Skip `token_` and `chainLinkPath_` when `Strategy.NO_YIELD`.
            token_ = address(0);
            chainLinkPath_ = "";
        } else {
            rewardPool_.onlyPublicRewardPool(rewardPoolIndex_);
        }

        // Set `aToken_` when `Strategy.AAVE`. Add allowance for Aave to transfer `token_` from the current
        // contract.
        address aToken_ = address(0);
        if (strategy_ == Strategy.AAVE) {
            (aToken_, , ) = AaveIPoolDataProvider(aavePoolDataProvider).getReserveTokensAddresses(token_);

            IERC20(token_).safeApprove(aavePool, type(uint256).max);
            IERC20(aToken_).approve(aavePool, type(uint256).max);
        }

        DepositPool memory depositPool_ = DepositPool(token_, chainLinkPath_, 0, 0, 0, strategy_, aToken_, true);

        depositPoolAddresses[rewardPoolIndex_].push(depositPoolAddress_);
        depositPools[rewardPoolIndex_][depositPoolAddress_] = depositPool_;

        // Update prices for all `depositPools` by `rewardPoolIndex_`
        if (strategy_ != Strategy.NO_YIELD) {
            updateDepositTokensPrices(rewardPoolIndex_);
        }

        emit DepositPoolAdded(rewardPoolIndex_, depositPool_);
    }

    function _onlyExistedDepositPool(uint256 rewardPoolIndex_, address depositPoolAddress_) private view {
        require(depositPools[rewardPoolIndex_][depositPoolAddress_].isExist, "DR: deposit pool doesn't exist");
    }

    /**********************************************************************************************/
    /*** Functionality to update prices for all deposit pools                                   ***/
    /**********************************************************************************************/

    function updateDepositTokensPrices(uint256 rewardPoolIndex_) public {
        IRewardPool(rewardPool).onlyPublicRewardPool(rewardPoolIndex_);

        uint256 length_ = depositPoolAddresses[rewardPoolIndex_].length;
        IChainLinkDataConsumer chainLinkDataConsumer_ = IChainLinkDataConsumer(chainLinkDataConsumer);

        address[] storage addressesForIndex = depositPoolAddresses[rewardPoolIndex_];
        mapping(address => DepositPool) storage poolsForIndex = depositPools[rewardPoolIndex_];

        for (uint256 i = 0; i < length_; i++) {
            address depositPoolAddress_ = addressesForIndex[i];
            DepositPool storage depositPool = poolsForIndex[depositPoolAddress_];

            bytes32 chainLinkPathId_ = chainLinkDataConsumer_.getPathId(depositPool.chainLinkPath);
            uint256 price_ = chainLinkDataConsumer_.getChainLinkDataFeedLatestAnswer(chainLinkPathId_);

            require(price_ > 0, "DR: price for pair is zero");
            depositPool.tokenPrice = price_;

            emit TokenPriceSet(depositPool.chainLinkPath, price_);
        }
    }

    /**********************************************************************************************/
    /*** Yield logic functionality                                                              ***/
    /**********************************************************************************************/

    function supply(uint256 rewardPoolIndex_, uint256 amount_) external {
        address depositPoolAddress_ = _msgSender();
        _onlyExistedDepositPool(rewardPoolIndex_, depositPoolAddress_);

        DepositPool storage depositPool = depositPools[rewardPoolIndex_][depositPoolAddress_];
        require(depositPool.strategy != Strategy.NO_YIELD, "DR: invalid strategy for the deposit pool");

        distributeRewards(rewardPoolIndex_);
        _withdrawYield(rewardPoolIndex_, depositPoolAddress_);

        IERC20(depositPool.token).safeTransferFrom(depositPoolAddress_, address(this), amount_);
        if (depositPool.strategy == Strategy.AAVE) {
            AaveIPool(aavePool).supply(depositPool.token, amount_, address(this), 0);
        }

        depositPool.deposited += amount_;
        depositPool.lastUnderlyingBalance += amount_;
    }

    function withdraw(uint256 rewardPoolIndex_, uint256 amount_) external returns (uint256) {
        address depositPoolAddress_ = _msgSender();
        _onlyExistedDepositPool(rewardPoolIndex_, depositPoolAddress_);

        DepositPool storage depositPool = depositPools[rewardPoolIndex_][depositPoolAddress_];
        require(depositPool.strategy != Strategy.NO_YIELD, "DR: invalid strategy for the deposit pool");

        distributeRewards(rewardPoolIndex_);

        amount_ = amount_.min(depositPool.deposited);
        require(amount_ > 0, "DR: nothing to withdraw");

        depositPool.deposited -= amount_;
        depositPool.lastUnderlyingBalance -= amount_;

        _withdrawYield(rewardPoolIndex_, depositPoolAddress_);

        if (depositPool.strategy == Strategy.AAVE) {
            AaveIPool(aavePool).withdraw(depositPool.token, amount_, depositPoolAddress_);
        } else {
            IERC20(depositPool.token).safeTransfer(depositPoolAddress_, amount_);
        }

        return amount_;
    }

    function distributeRewards(uint256 rewardPoolIndex_) public {
        //// Base validation
        IRewardPool rewardPool_ = IRewardPool(rewardPool);
        rewardPool_.onlyExistedRewardPool(rewardPoolIndex_);

        uint128 lastCalculatedTimestamp_ = rewardPoolLastCalculatedTimestamp[rewardPoolIndex_];
        require(lastCalculatedTimestamp_ != 0, "DR: `rewardPoolLastCalculatedTimestamp` isn't set");
        //// End

        //// Calculate the reward amount
        uint256 rewards_ = IRewardPool(rewardPool).getPeriodRewards(
            rewardPoolIndex_,
            lastCalculatedTimestamp_,
            uint128(block.timestamp)
        );
        rewardPoolLastCalculatedTimestamp[rewardPoolIndex_] = uint128(block.timestamp);
        if (rewards_ == 0) return;
        //// End

        // Stop execution when the reward pool is private
        if (!rewardPool_.isRewardPoolPublic(rewardPoolIndex_)) {
            _onlyExistedDepositPool(rewardPoolIndex_, depositPoolAddresses[rewardPoolIndex_][0]);
            distributedRewards[rewardPoolIndex_][depositPoolAddresses[rewardPoolIndex_][0]] += rewards_;

            return;
        }

        // Validate that public reward pools await `minRewardsDistributePeriod`
        if (block.timestamp <= lastCalculatedTimestamp_ + minRewardsDistributePeriod) return;

        //// Update prices
        updateDepositTokensPrices(rewardPoolIndex_);
        //// End

        //// Calculate `yield` from all deposit pools
        uint256 length_ = depositPoolAddresses[rewardPoolIndex_].length;
        uint256 totalYield_ = 0;
        uint256[] memory yields_ = new uint256[](length_);

        for (uint256 i = 0; i < length_; i++) {
            DepositPool storage depositPool = depositPools[rewardPoolIndex_][depositPoolAddresses[rewardPoolIndex_][i]];

            address yieldToken_;
            if (depositPool.strategy == Strategy.AAVE) {
                yieldToken_ = depositPool.aToken;
            } else if (depositPool.strategy == Strategy.NONE) {
                // The current condition coverage cannot be achieved in the current version.
                // Added to avoid errors in the future.
                yieldToken_ = depositPool.token;
            }

            uint256 balance_ = IERC20(yieldToken_).balanceOf(address(this));
            uint256 decimals_ = IERC20Metadata(yieldToken_).decimals();
            uint256 underlyingYield_ = (balance_ - depositPool.lastUnderlyingBalance).to18(decimals_);
            uint256 yield_ = underlyingYield_ * depositPool.tokenPrice;

            depositPool.lastUnderlyingBalance = balance_;

            yields_[i] = yield_;
            totalYield_ += yield_;
        }

        if (totalYield_ == 0) {
            undistributedRewards += rewards_;
            return;
        }
        //// End

        //// Calculate `depositPools` shares and reward amount for each `depositPool`
        for (uint256 i = 0; i < length_; i++) {
            if (yields_[i] == 0) continue;

            distributedRewards[rewardPoolIndex_][depositPoolAddresses[rewardPoolIndex_][i]] +=
                (yields_[i] * rewards_) /
                totalYield_;
        }
        //// End
    }

    /**********************************************************************************************/
    /*** Yield and rewards transfer functionality                                               ***/
    /**********************************************************************************************/

    function withdrawYield(uint256 rewardPoolIndex_, address depositPoolAddress_) external {
        _onlyExistedDepositPool(rewardPoolIndex_, depositPoolAddress_);

        DepositPool storage depositPool = depositPools[rewardPoolIndex_][depositPoolAddress_];
        require(depositPool.strategy != Strategy.NO_YIELD, "DR: invalid strategy for the deposit pool");

        distributeRewards(rewardPoolIndex_);
        _withdrawYield(rewardPoolIndex_, depositPoolAddress_);
    }

    function withdrawUndistributedRewards(address user_, address refundTo_) external payable onlyOwner {
        require(undistributedRewards > 0, "DR: nothing to withdraw");

        IL1SenderV2(l1Sender).sendMintMessage{value: msg.value}(user_, undistributedRewards, refundTo_);

        undistributedRewards = 0;
    }

    /**
     * @dev Used as a universal proxy for all `DepositPool` so that the `msg.sender` of the message to the
     * reward mint is one.
     */
    function sendMintMessage(
        uint256 rewardPoolIndex_,
        address user_,
        uint256 amount_,
        address refundTo_
    ) external payable {
        address depositPoolAddress_ = _msgSender();
        _onlyExistedDepositPool(rewardPoolIndex_, depositPoolAddress_);

        IL1SenderV2(l1Sender).sendMintMessage{value: msg.value}(user_, amount_, refundTo_);
    }

    /**
     * @dev Move yield to the `l1Sender`. The current contract merely collects the yield and passes
     * it on, for further distribution. Since the logic of yield transfer (e.g. using bridges) for
     * each token may be different.
     */
    function _withdrawYield(uint256 rewardPoolIndex_, address depositPoolAddress_) private {
        DepositPool storage depositPool = depositPools[rewardPoolIndex_][depositPoolAddress_];

        uint256 yield_ = depositPool.lastUnderlyingBalance - depositPool.deposited;
        if (yield_ == 0) return;

        if (depositPool.strategy == Strategy.AAVE) {
            AaveIPool(aavePool).withdraw(depositPool.token, yield_, l1Sender);
        } else {
            IERC20(depositPool.token).safeTransfer(l1Sender, yield_);
        }

        depositPool.lastUnderlyingBalance -= yield_;
    }

    /**********************************************************************************************/
    /*** Contracts getters                                                                      ***/
    /**********************************************************************************************/

    function getDistributedRewards(
        uint256 rewardPoolIndex_,
        address depositPoolAddress_
    ) external view returns (uint256) {
        return distributedRewards[rewardPoolIndex_][depositPoolAddress_];
    }

    /**********************************************************************************************/
    /*** UUPS                                                                                   ***/
    /**********************************************************************************************/

    function version() external pure returns (uint256) {
        return 1;
    }

    function _authorizeUpgrade(address) internal view override onlyOwner {}
}
