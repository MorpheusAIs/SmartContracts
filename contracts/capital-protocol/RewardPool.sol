// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import {LinearDistributionIntervalDecrease} from "../libs/LinearDistributionIntervalDecrease.sol";

import {IRewardPool, IERC165} from "../interfaces/capital-protocol/IRewardPool.sol";

contract RewardPool is IRewardPool, OwnableUpgradeable, UUPSUpgradeable {
    RewardPool[] public rewardPools;

    /**********************************************************************************************/
    /*** Init, IERC165                                                                          ***/
    /**********************************************************************************************/

    constructor() {
        _disableInitializers();
    }

    function RewardPool_init(RewardPool[] calldata poolsInfo_) external initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();

        for (uint256 i = 0; i < poolsInfo_.length; i++) {
            addRewardPool(poolsInfo_[i]);
        }
    }

    function supportsInterface(bytes4 interfaceId_) external pure returns (bool) {
        return interfaceId_ == type(IRewardPool).interfaceId || interfaceId_ == type(IERC165).interfaceId;
    }

    /**********************************************************************************************/
    /*** Reward pools management, `owner()` functionality                                       ***/
    /**********************************************************************************************/

    function addRewardPool(RewardPool calldata rewardPool_) public onlyOwner {
        require(rewardPool_.decreaseInterval > 0, "RP: invalid decrease interval");

        rewardPools.push(rewardPool_);

        emit RewardPoolAdded(rewardPools.length - 1, rewardPool_);
    }

    /**********************************************************************************************/
    /*** Main getters                                                                           ***/
    /**********************************************************************************************/

    function isRewardPoolExist(uint256 index_) public view returns (bool) {
        return index_ < rewardPools.length;
    }

    function isRewardPoolPublic(uint256 index_) public view returns (bool) {
        return rewardPools[index_].isPublic;
    }

    function onlyExistedRewardPool(uint256 index_) external view {
        require(isRewardPoolExist(index_), "RP: the reward pool doesn't exist");
    }

    function onlyPublicRewardPool(uint256 index_) external view {
        require(isRewardPoolPublic(index_), "RP: the pool isn't public");
    }

    function onlyNotPublicRewardPool(uint256 index_) external view {
        require(!isRewardPoolPublic(index_), "RP: the pool is public");
    }

    function getPeriodRewards(uint256 index_, uint128 startTime_, uint128 endTime_) external view returns (uint256) {
        if (!isRewardPoolExist(index_)) {
            return 0;
        }

        RewardPool storage rewardPool = rewardPools[index_];

        return
            LinearDistributionIntervalDecrease.getPeriodReward(
                rewardPool.initialReward,
                rewardPool.rewardDecrease,
                rewardPool.payoutStart,
                rewardPool.decreaseInterval,
                startTime_,
                endTime_
            );
    }

    /**********************************************************************************************/
    /*** UUPS                                                                                   ***/
    /**********************************************************************************************/

    function version() external pure returns (uint256) {
        return 1;
    }

    function _authorizeUpgrade(address) internal view override onlyOwner {}
}
