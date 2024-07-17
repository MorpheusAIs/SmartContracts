// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {IDistribution} from "../interfaces/IDistribution.sol";
import {IDistributionExt} from "../interfaces/extensions/IDistributionExt.sol";

contract DistributionExt is IDistributionExt, Ownable {
    address public distribution;
    uint256[] public poolIds;

    constructor(address distribution_, uint256[] memory poolIds_) {
        setDistribution(distribution_);
        setPoolIds(poolIds_);
    }

    function setDistribution(address distribution_) public onlyOwner {
        require(distribution_ != address(0), "DEXT: zero address");

        distribution = distribution_;
    }

    function setPoolIds(uint256[] memory poolIds_) public onlyOwner {
        require(poolIds_.length > 0, "DEXT: array is empty");

        poolIds = poolIds_;
    }

    function getTotalRewards() external view returns (uint256) {
        uint256 count_ = poolIds.length;
        IDistribution distribution_ = IDistribution(distribution);
        uint256 amount_;

        for (uint256 i = 0; i < count_; i++) {
            uint256 poolId_ = poolIds[i];

            amount_ += distribution_.getPeriodReward(poolId_, 0, uint128(block.timestamp));
        }

        return amount_;
    }
}
