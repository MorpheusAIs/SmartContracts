// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

interface IChainLinkDataConsumer is IERC165 {
    event DataFeedSet(string path, address[] feeds);
    function updateDataFeeds(string[] calldata paths_, address[][] calldata feeds_) external;
    function getPathId(string memory path_) external pure returns (bytes32);
    function getChainLinkDataFeedLatestAnswer(bytes32 pathId_) external view returns (uint256);
    function version() external pure returns (uint256);
}
