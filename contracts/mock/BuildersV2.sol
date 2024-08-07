// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import {LockMultiplierMath} from "../libs/LockMultiplierMath.sol";

contract BuildersV2 is UUPSUpgradeable {
    function version() external pure returns (uint256) {
        return 2;
    }

    function getLockPeriodMultiplier(uint128 start_, uint128 end_) public pure returns (uint256) {
        return LockMultiplierMath._getLockPeriodMultiplier(start_, end_);
    }

    function _authorizeUpgrade(address) internal view override {}
}
