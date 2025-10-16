
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

contract MockAggregatorV3 is AggregatorV3Interface {
    int256 private _latestAnswer;
    uint256 private _updatedAt;

    function setLatestAnswer(int256 answer) external {
        _latestAnswer = answer;
        _updatedAt = block.timestamp;
    }

    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    ) {
        return (1, _latestAnswer, block.timestamp, _updatedAt, 1);
    }

    function decimals() external pure returns (uint8) {
        return 8;
    }

    function description() external pure returns (string memory) {
        return "Mock Aggregator";
    }

    function version() external pure returns (uint256) {
        return 1;
    }

    function getRoundData(uint80 _roundId) external view returns (uint80,int256,uint256,uint256,uint80) {
        return (1, _latestAnswer, block.timestamp, _updatedAt, 1);
    }
}
