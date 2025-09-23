// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IBuildersV4} from "../interfaces/builder-protocol/IBuildersV4.sol";
import {IBuildersTreasuryV2, IERC165} from "../interfaces/builder-protocol/IBuildersTreasuryV2.sol";

contract BuildersTreasuryV2 is IBuildersTreasuryV2, OwnableUpgradeable, UUPSUpgradeable {
    using SafeERC20 for IERC20;

    /** @dev The `MOR` token contract address */
    address public rewardToken;

    /** @dev The `BuildersV4` contract address */
    address public builders;

    /** @dev The amount of transferred rewards by the `BuildersV4` contract */
    uint256 public distributedRewards;

    constructor() {
        _disableInitializers();
    }

    function BuildersTreasuryV2_init(address rewardToken_) external initializer {
        __Ownable_init();

        rewardToken = rewardToken_;
    }

    function supportsInterface(bytes4 interfaceId_) external pure returns (bool) {
        return interfaceId_ == type(IBuildersTreasuryV2).interfaceId || interfaceId_ == type(IERC165).interfaceId;
    }

    /**********************************************************************************************/
    /*** The contract owner functionality                                                       ***/
    /**********************************************************************************************/

    function setBuilders(address builders_) public onlyOwner {
        require(IERC165(builders_).supportsInterface(type(IBuildersV4).interfaceId), "BT: invalid `BuildersV4`");

        builders = builders_;

        emit BuildersSet(builders_);
    }

    function withdraw(address receiver_, uint256 amount_) external onlyOwner {
        require(receiver_ != address(0), "BT: invalid receiver address");

        IERC20(rewardToken).safeTransfer(receiver_, amount_);
    }

    /**********************************************************************************************/
    /*** The `BuildersV4` functionality                                                         ***/
    /**********************************************************************************************/

    function sendRewards(address receiver_, uint256 amount_) external {
        require(_msgSender() == builders, "BT: the caller isn't the `BuildersV4`");
        require(receiver_ != address(0), "BT: invalid receiver address");

        distributedRewards += amount_;
        IERC20(rewardToken).safeTransfer(receiver_, amount_);

        emit RewardSent(receiver_, amount_);
    }

    /**********************************************************************************************/
    /*** UUPS functionality                                                                     ***/
    /**********************************************************************************************/

    function version() external pure returns (uint256) {
        return 2;
    }

    function _authorizeUpgrade(address) internal view override onlyOwner {}
}
