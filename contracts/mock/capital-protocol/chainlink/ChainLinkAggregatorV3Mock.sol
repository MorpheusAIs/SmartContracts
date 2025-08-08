// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

contract ChainLinkAggregatorV3Mock is AggregatorV3Interface {
    int256 public answerResult;
    uint8 public decimals;
    uint256 public updated;

    constructor(uint8 decimals_) {
        decimals = decimals_;
    }

    function setDecimals(uint8 value_) external {
        decimals = value_;
    }

    function description() external pure returns (string memory) {
        return "";
    }

    function version() external pure returns (uint256) {
        return 666;
    }

    function getRoundData(
        uint80 roundId_
    )
        external
        pure
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        return (roundId_, 1, 1, 1, 1);
    }

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        return (roundId, answerResult, 1, updated == 0 ? block.timestamp : updated, 1);
    }

    function setAnswerResult(int256 answerResult_) external {
        answerResult = answerResult_;
    }

    function setUpdated(uint256 updatedAt_) external {
        updated = updatedAt_;
    }
}
