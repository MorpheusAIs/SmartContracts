// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IDistributorV3, IERC165} from "../../interfaces/capital-protocol/IDistributorV3.sol";
import {IDepositPoolV8} from "../../interfaces/capital-protocol/IDepositPoolV8.sol";

contract DepositPoolV8Mock is IERC165 {
    address public distributor;
    address public depositToken;

    constructor(address distributor_, address depositToken_) {
        distributor = distributor_;
        depositToken = depositToken_;

        IERC20(depositToken_).approve(distributor_, type(uint256).max);
    }

    function supportsInterface(bytes4 interfaceId_) external pure returns (bool) {
        return interfaceId_ == type(IDepositPoolV8).interfaceId || interfaceId_ == type(IERC165).interfaceId;
    }

    function supply(uint256 rewardPoolIndex_, address user_, uint256 amount_) external returns (uint256) {
        return IDistributorV3(distributor).supply(rewardPoolIndex_, user_, amount_);
    }

    function withdraw(uint256 rewardPoolIndex_, address user_, uint256 amount_) external returns (uint256) {
        return IDistributorV3(distributor).withdraw(rewardPoolIndex_, user_, amount_);
    }

    function sendMintMessage(
        uint256 rewardPoolIndex_,
        address user_,
        uint256 amount_,
        address refundTo_
    ) external payable {
        IDistributorV3(distributor).sendMintMessage(rewardPoolIndex_, user_, amount_, refundTo_);
    }
}
