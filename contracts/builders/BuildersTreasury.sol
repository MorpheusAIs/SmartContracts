// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {PRECISION} from "@solarity/solidity-lib/utils/Globals.sol";

import {IBuildersTreasury} from "../interfaces/builders/IBuildersTreasury.sol";

contract BuildersTreasury is IBuildersTreasury, OwnableUpgradeable, UUPSUpgradeable {
    address public rewardToken;
    address public builders;

    uint256 public distributedRewards;

    modifier onlyBuilders() {
        _onlyBuilders();
        _;
    }

    constructor() {
        _disableInitializers();
    }

    function BuildersTreasury_init(address rewardToken_, address builders_) external initializer {
        __Ownable_init();

        rewardToken = rewardToken_;

        setBuilders(builders_);
    }

    function setBuilders(address builders_) public onlyOwner {
        require(builders_ != address(0), "BT: invalid builders");

        builders = builders_;
    }

    function getTotalRewards() public view returns (uint256) {
        return IERC20(rewardToken).balanceOf(address(this)) + distributedRewards;
    }

    function sendReward(address receiver_, uint256 amount_) external onlyBuilders {
        distributedRewards += amount_;

        IERC20(rewardToken).transfer(receiver_, amount_);
    }

    function _onlyBuilders() internal view {
        require(msg.sender == builders, "BT: caller is not the builder");
    }

    function _authorizeUpgrade(address) internal view override onlyOwner {}
}
