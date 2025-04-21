// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import {IDistribution} from "../interfaces/capital-protocol/old/IDistribution.sol";
import {IDistributionExt} from "../interfaces/extensions/IDistributionExt.sol";

contract DistributionExt is IDistributionExt, OwnableUpgradeable, UUPSUpgradeable {
    address public distribution;
    uint256[] public poolIds;

    constructor() {
        _disableInitializers();
    }

    function DistributionExt_init(address distribution_, uint256[] memory poolIds_) external initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();

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

    function _authorizeUpgrade(address) internal view override onlyOwner {}
}
