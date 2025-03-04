// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

contract AggregatorV3 is AggregatorV3Interface {
    int256 answerResult;

    function decimals() external pure returns (uint8) {
        return 8;
    }

    function description() external pure returns (string memory) {
        return "";
    }

    function version() external pure returns (uint256) {
        return 666;
    }

    function getRoundData(
        uint80 _roundId
    )
        external
        pure
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        return (_roundId, 1, 1, 1, 1);
    }

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        return (roundId, answerResult, 1, 1, 1);
    }

    function setAnswerResult(int256 _answerResult) external {
        answerResult = _answerResult;
    }
}
