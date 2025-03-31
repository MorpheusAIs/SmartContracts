// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import {IDistribution, LinearDistributionIntervalDecrease} from "../capital-protocol/old/Distribution.sol";

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {LZEndpointMock} from "@layerzerolabs/solidity-examples/contracts/lzApp/mocks/LZEndpointMock.sol";

contract DistributionV2Mock is UUPSUpgradeable {
    IDistribution.Pool[] public pools;

    function version() external pure returns (uint256) {
        return 2;
    }

    function createPool(IDistribution.Pool calldata pool_) public {
        pools.push(pool_);
    }

    function getPeriodReward(uint256 poolId_, uint128 startTime_, uint128 endTime_) public view returns (uint256) {
        IDistribution.Pool storage pool = pools[poolId_];

        return
            LinearDistributionIntervalDecrease.getPeriodReward(
                pool.initialReward,
                pool.rewardDecrease,
                pool.payoutStart,
                pool.decreaseInterval,
                startTime_,
                endTime_
            );
    }

    function _authorizeUpgrade(address) internal view override {}
}
