// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import {PRECISION} from "@solarity/solidity-lib/utils/Globals.sol";

import {LinearDistributionIntervalDecrease} from "../libs/LinearDistributionIntervalDecrease.sol";

import {IDepositPool, IERC165} from "../interfaces/capital-protocol/IDepositPool.sol";
import {IChainLinkDataConsumerV3} from "../interfaces/capital-protocol/chainlink/IChainLinkDataConsumerV3.sol";

contract Distributor is OwnableUpgradeable, UUPSUpgradeable {
    struct DepositPoolDetails {
        address poolContract;
        address depositToken;
        string chainLinkPath;
        uint256 depositTokenPrice;
    }

    bool public isNotUpgradeable;

    address public chainLinkDataConsumerV3;
    DepositPoolDetails[] public depositPoolsDetails;

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

    function setChainLinkDataConsumerV3(address value_) public onlyOwner {
        require(
            IERC165(value_).supportsInterface(type(IChainLinkDataConsumerV3).interfaceId),
            "BS: invalid data consumer"
        );

        chainLinkDataConsumerV3 = value_;
    }

    function addDepositPoolDetails(address poolContract_, string memory chainLinkPath_) external onlyOwner {
        require(
            IERC165(poolContract_).supportsInterface(type(IDepositPool).interfaceId),
            "DR: invalid capital contract address"
        );

        address depositToken_ = IDepositPool(poolContract_).depositToken();

        DepositPoolDetails memory capitalPool_ = DepositPoolDetails(poolContract_, depositToken_, chainLinkPath_, 0);
        depositPoolsDetails.push(capitalPool_);

        updateDepositTokensPrices();
    }

    function updateDepositTokensPrices() public {
        uint256 length_ = depositPoolsDetails.length;
        IChainLinkDataConsumerV3 chainLinkDataConsumerV3_ = IChainLinkDataConsumerV3(chainLinkDataConsumerV3);

        for (uint256 i = 0; i < length_; i++) {
            bytes32 chainLinkPathId = chainLinkDataConsumerV3_.getPathId(depositPoolsDetails[i].chainLinkPath);
            uint256 price_ = chainLinkDataConsumerV3_.getChainLinkDataFeedLatestAnswer(chainLinkPathId);

            require(price_ > 0, "DR: price for pair is zero");
            depositPoolsDetails[i].depositTokenPrice = price_;
        }
    }

    /**********************************************************************************************/
    /*** UUPS                                                                                   ***/
    /**********************************************************************************************/

    function removeUpgradeability() external onlyOwner {
        isNotUpgradeable = true;
    }

    function version() external pure returns (uint256) {
        return 1;
    }

    function _authorizeUpgrade(address) internal view override onlyOwner {
        require(!isNotUpgradeable, "DR: upgrade isn't available");
    }
}
