// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IRewardPool, IERC165} from "../../interfaces/capital-protocol/IRewardPool.sol";

contract RewardPoolMock is IERC165 {
    uint256 periodRewardAnswer;
    mapping(uint256 => bool) isRewardPoolPublicAnswer;
    mapping(uint256 => bool) isRewardPoolExistAnswer;

    function supportsInterface(bytes4 interfaceId_) external pure returns (bool) {
        return interfaceId_ == type(IRewardPool).interfaceId || interfaceId_ == type(IERC165).interfaceId;
    }

    function onlyExistedRewardPool(uint256 index_) public view {}

    function onlyPublicRewardPool(uint256 index_) public view {}

    function onlyNotPublicRewardPool(uint256 index_) public view {}

    function setIsRewardPoolExist(uint256 index_, bool value_) external {
        isRewardPoolExistAnswer[index_] = value_;
    }

    function isRewardPoolExist(uint256 index_) external view returns (bool) {
        return isRewardPoolExistAnswer[index_];
    }

    function setIsRewardPoolPublic(uint256 index_, bool value_) external {
        isRewardPoolPublicAnswer[index_] = value_;
    }

    function isRewardPoolPublic(uint256 index_) external view returns (bool) {
        return isRewardPoolPublicAnswer[index_];
    }

    function setPeriodRewardAnswer(uint256 value_) external {
        periodRewardAnswer = value_;
    }

    function getPeriodRewards(uint256 index_, uint128 startTime_, uint128 endTime_) public view returns (uint256) {
        uint256 preventWarnings_ = index_ + startTime_ + endTime_;

        return periodRewardAnswer + preventWarnings_ - preventWarnings_;
    }
}
