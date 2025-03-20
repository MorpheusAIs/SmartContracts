// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

import {DecimalsConverter} from "@solarity/solidity-lib/libs/decimals/DecimalsConverter.sol";

import {IChainLinkDataConsumer, IERC165} from "../interfaces/capital-protocol/IChainLinkDataConsumer.sol";

/**
 * @dev https://docs.chain.link/data-feeds/getting-started
 */
contract ChainLinkDataConsumer is IChainLinkDataConsumer, OwnableUpgradeable, UUPSUpgradeable {
    using DecimalsConverter for uint256;

    mapping(bytes32 => address[]) public dataFeeds;

    /**********************************************************************************************/
    /*** Init, IERC165                                                                          ***/
    /**********************************************************************************************/

    constructor() {
        _disableInitializers();
    }

    function ChainLinkDataConsumer_init() external initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();
    }

    function supportsInterface(bytes4 interfaceId_) external pure returns (bool) {
        return interfaceId_ == type(IChainLinkDataConsumer).interfaceId || interfaceId_ == type(IERC165).interfaceId;
    }

    /**********************************************************************************************/
    /*** Add or remove data feeds                                                               ***/
    /**********************************************************************************************/

    /**
     * @dev https://docs.chain.link/data-feeds/price-feeds/addresses?network=ethereum&page=1
     */
    function updateDataFeeds(string[] calldata paths_, address[][] calldata feeds_) external onlyOwner {
        require(paths_.length == feeds_.length, "CLDC: mismatched array lengths");
        for (uint256 i = 0; i < paths_.length; i++) {
            require(feeds_[i].length > 0, "CLDC: empty feed array");
            dataFeeds[getPathId(paths_[i])] = feeds_[i];

            emit DataFeedSet(paths_[i], feeds_[i]);
        }
    }

    function getPathId(string memory path_) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(path_));
    }

    function decimals() public pure returns (uint8) {
        return 18;
    }

    /**********************************************************************************************/
    /*** Get data feeds                                                                         ***/
    /**********************************************************************************************/

    function getChainLinkDataFeedLatestAnswer(bytes32 pathId_) external view returns (uint256) {
        address[] memory dataFeeds_ = dataFeeds[pathId_];

        uint256 res_ = 0;
        uint8 baseDecimals_ = 0;
        for (uint256 i = 0; i < dataFeeds_.length; i++) {
            AggregatorV3Interface aggregator_ = AggregatorV3Interface(dataFeeds_[i]);

            try aggregator_.latestRoundData() returns (uint80, int256 answer_, uint256, uint256, uint80) {
                if (answer_ <= 0) {
                    return 0;
                }

                if (res_ == 0) {
                    res_ = uint256(answer_);
                    baseDecimals_ = aggregator_.decimals();
                } else {
                    res_ = (res_ * uint256(answer_)) / (10 ** aggregator_.decimals());
                }
            } catch {
                return 0;
            }
        }

        return res_.convert(baseDecimals_, 18);
    }

    /**********************************************************************************************/
    /*** UUPS                                                                                   ***/
    /**********************************************************************************************/

    function version() external pure returns (uint256) {
        return 1;
    }

    function _authorizeUpgrade(address) internal view override onlyOwner {}
}
