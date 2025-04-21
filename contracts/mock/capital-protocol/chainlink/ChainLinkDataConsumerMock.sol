// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IChainLinkDataConsumer, IERC165} from "../../../interfaces/capital-protocol/IChainLinkDataConsumer.sol";

contract ChainLinkDataConsumerMock is IERC165 {
    bytes32 public pathId;
    mapping(bytes32 => uint256) public answers;

    function supportsInterface(bytes4 interfaceId_) external pure returns (bool) {
        return interfaceId_ == type(IChainLinkDataConsumer).interfaceId || interfaceId_ == type(IERC165).interfaceId;
    }

    function getPathId(string memory path_) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(path_));
    }

    function setAnswer(string calldata path_, uint256 answer_) external {
        answers[getPathId(path_)] = answer_;
    }

    function getChainLinkDataFeedLatestAnswer(bytes32 pathId_) external view returns (uint256) {
        return answers[pathId_];
    }
}
