// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

interface IChainLinkDataConsumer is IERC165 {
    event DataFeedSet(string path, address[] feeds);

    function ChainLinkDataConsumer_init() external;

    /**
     * The function to set the feed.
     * @param paths_ Path like ['wETH/USD'] or ['wETH/wBTC,wBTC/USD']
     * @param feeds_ Feeds like [['0x...']] or [['0x...', '0x...']]
     */
    function updateDataFeeds(string[] calldata paths_, address[][] calldata feeds_) external;

    /**
     * The function to get path ID.
     * @param path_ Path like 'wETH/USD'
     */
    function getPathId(string memory path_) external pure returns (bytes32);

    /**
     * The function to get the token price.
     * @param pathId_ Path ID.
     */
    function getChainLinkDataFeedLatestAnswer(bytes32 pathId_) external view returns (uint256);

    /**
     * The function to get the contract version.
     */
    function version() external pure returns (uint256);
}
