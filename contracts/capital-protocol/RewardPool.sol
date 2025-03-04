// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import {LinearDistributionIntervalDecrease} from "../libs/LinearDistributionIntervalDecrease.sol";

import {IRewardPool, IERC165} from "../interfaces/capital-protocol/IRewardPool.sol";

contract RewardPool is IRewardPool, OwnableUpgradeable, UUPSUpgradeable {
    bool isNotUpgradeable;
    RewardPool[] public rewardPools;

    /**********************************************************************************************/
    /*** INIT, IERC165                                                                          ***/
    /**********************************************************************************************/
    constructor() {
        _disableInitializers();
    }

    function RewardPool_init(RewardPool[] calldata poolsInfo_) external initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();

        for (uint256 i_ = 0; i_ < poolsInfo_.length; i_++) {
            addRewardPool(poolsInfo_[i_]);
        }
    }

    function supportsInterface(bytes4 interfaceId_) external pure returns (bool) {
        return interfaceId_ == type(IRewardPool).interfaceId || interfaceId_ == type(IERC165).interfaceId;
    }

    /**********************************************************************************************/
    /*** REWARD POOL MANAGEMENT                                                                 ***/
    /**********************************************************************************************/
    function addRewardPool(RewardPool calldata rewardPool_) public onlyOwner {
        require(rewardPool_.decreaseInterval > 0, "RP: invalid decrease interval");

        rewardPools.push(rewardPool_);

        emit RewardPoolAdded(rewardPools.length - 1, rewardPool_);
    }

    /**********************************************************************************************/
    /*** GETTERS                                                                                ***/
    /**********************************************************************************************/

    function rewardPoolExists(uint256 poolId_) public view returns (bool) {
        return poolId_ < rewardPools.length;
    }

    function getPeriodRewards(uint256 poolId_, uint128 startTime_, uint128 endTime_) public view returns (uint256) {
        if (!rewardPoolExists(poolId_)) {
            return 0;
        }

        RewardPool storage rewardPool = rewardPools[poolId_];

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
    function removeUpgradeability() external onlyOwner {
        isNotUpgradeable = true;
    }

    function version() external pure returns (uint256) {
        return 1;
    }

    function _authorizeUpgrade(address) internal view override onlyOwner {
        require(!isNotUpgradeable, "RP: upgrade isn't available");
    }
}
