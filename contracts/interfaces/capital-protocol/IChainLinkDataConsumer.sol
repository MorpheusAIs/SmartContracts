// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

/**
 * @title IChainLinkDataConsumer
 * @notice Defines the basic interface for the ChainLinkDataConsumer
 */
interface IChainLinkDataConsumer is IERC165 {
    /**
     * @notice The event that is emitted when the data feed set.
     * @param path The readable string to understand for what feeds set.
     * @param feeds The addresses of the feeds. https://docs.chain.link/data-feeds/price-feeds/addresses?network=ethereum&page=1&testnetPage=1
     */
    event DataFeedSet(string path, address[] feeds);

    /**
     * @notice The function to initialize the contract.
     */
    function ChainLinkDataConsumer_init() external;

    /**
     * @notice The function to set the feed.
     * @param paths_ Path like ['wETH/USD'] or ['wETH/wBTC,wBTC/USD']
     * @param feeds_ Feeds like [['0x...']] or [['0x...', '0x...']]. https://docs.chain.link/data-feeds/price-feeds/addresses?network=ethereum&page=1&testnetPage=1
     */
    function updateDataFeeds(string[] calldata paths_, address[][] calldata feeds_) external;

    /**
     * @notice The function to get the path ID.
     * @param path_ The path like 'wETH/USD'
     * @return The path ID.
     */
    function getPathId(string memory path_) external pure returns (bytes32);

    /**
     * @notice The function to get the token price.
     * @param pathId_ The path ID.
     * @return The asset price.
     */
    function getChainLinkDataFeedLatestAnswer(bytes32 pathId_) external view returns (uint256);

    /**
     * @notice The function to get the contract version.
     * @return The current contract version
     */
    function version() external pure returns (uint256);
}
