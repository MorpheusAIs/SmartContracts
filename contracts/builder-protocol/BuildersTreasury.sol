// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {PRECISION} from "@solarity/solidity-lib/utils/Globals.sol";

import {IBuilders} from "../interfaces/builder-protocol/old/IBuilders.sol";
import {IBuildersTreasury, IERC165} from "../interfaces/builder-protocol/IBuildersTreasury.sol";

contract BuildersTreasury is IBuildersTreasury, OwnableUpgradeable, UUPSUpgradeable {
    address public rewardToken;
    address public builders;

    uint256 public distributedRewards;

    modifier onlyBuilders() {
        require(_msgSender() == builders, "BT: caller is not the builders");
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

    function supportsInterface(bytes4 interfaceId_) external pure returns (bool) {
        return interfaceId_ == type(IBuildersTreasury).interfaceId || interfaceId_ == type(IERC165).interfaceId;
    }

    function setBuilders(address builders_) public onlyOwner {
        require(IERC165(builders_).supportsInterface(type(IBuilders).interfaceId), "BT: invalid builders");

        builders = builders_;

        emit BuildersSet(builders_);
    }

    function sendRewards(address receiver_, uint256 amount_) external onlyBuilders {
        distributedRewards += amount_;

        IERC20(rewardToken).transfer(receiver_, amount_);

        emit RewardSent(receiver_, amount_);
    }

    function getAllRewards() public view returns (uint256) {
        return IERC20(rewardToken).balanceOf(address(this)) + distributedRewards;
    }

    function _authorizeUpgrade(address) internal view override onlyOwner {}
}
