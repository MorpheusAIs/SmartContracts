// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

import {IChainLinkDataConsumerV3, IERC165} from "../../interfaces/capital-protocol/chainlink/IChainLinkDataConsumerV3.sol";

/**
 * @dev https://docs.chain.link/data-feeds/getting-started
 */
contract ChainLinkDataConsumerV3 is IChainLinkDataConsumerV3, OwnableUpgradeable, UUPSUpgradeable {
    bool public isNotUpgradeable;

    mapping(bytes32 => address[]) public dataFeeds;

    /**********************************************************************************************/
    /*** INIT, IERC165                                                                          ***/
    /**********************************************************************************************/
    constructor() {
        _disableInitializers();
    }

    function ChainLinkDataConsumerV3_init() external initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();
    }

    function supportsInterface(bytes4 interfaceId_) external pure returns (bool) {
        return interfaceId_ == type(IChainLinkDataConsumerV3).interfaceId || interfaceId_ == type(IERC165).interfaceId;
    }

    /**********************************************************************************************/
    /*** ADD OR REMOVE DATA FEEDS                                                               ***/
    /**********************************************************************************************/
    /**
     * @dev https://docs.chain.link/data-feeds/price-feeds/addresses?network=ethereum&page=1
     */
    function updateDataFeeds(string[] calldata paths_, address[][] calldata feeds_) external onlyOwner {
        for (uint256 i = 0; i < paths_.length; i++) {
            dataFeeds[getPathId(paths_[i])] = feeds_[i];

            // emit DataFeedSet(pair_, feed_);
        }
    }

    function getPathId(string memory path_) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(path_));
    }

    /**********************************************************************************************/
    /*** GET DATA FEEDS                                                                         ***/
    /**********************************************************************************************/
    function getChainLinkDataFeedLatestAnswer(bytes32 pathId_) external view returns (uint256) {
        address[] memory dataFeeds_ = dataFeeds[pathId_];

        uint256 res_ = 0;
        for (uint256 i = 0; i < dataFeeds_.length; i++) {
            try AggregatorV3Interface(dataFeeds_[i]).latestRoundData() returns (
                uint80,
                int256 answer_,
                uint256,
                uint256,
                uint80
            ) {
                if (answer_ <= 0) {
                    return 0;
                }

                if (res_ == 0) {
                    res_ = uint256(answer_);
                } else {
                    res_ = (res_ * uint256(answer_)) / 10 ** AggregatorV3Interface(dataFeeds_[i]).decimals();
                }
            } catch {
                return 0;
            }
        }

        return res_;
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
        require(!isNotUpgradeable, "DS: upgrade isn't available");
    }
}
