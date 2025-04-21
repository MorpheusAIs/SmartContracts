// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IDistributor, IERC165} from "../../interfaces/capital-protocol/IDistributor.sol";
import {IDepositPool} from "../../interfaces/capital-protocol/IDepositPool.sol";

contract DepositPoolMock is IERC165 {
    address public distributor;
    address public depositToken;

    constructor(address distributor_, address depositToken_) {
        distributor = distributor_;
        depositToken = depositToken_;

        IERC20(depositToken_).approve(distributor_, type(uint256).max);
    }

    function supportsInterface(bytes4 interfaceId_) external pure returns (bool) {
        return interfaceId_ == type(IDepositPool).interfaceId || interfaceId_ == type(IERC165).interfaceId;
    }

    function supply(uint256 rewardPoolIndex_, uint256 amount_) external {
        IERC20(depositToken).transferFrom(msg.sender, address(this), amount_);
        IDistributor(distributor).supply(rewardPoolIndex_, amount_);
    }

    function withdraw(uint256 rewardPoolIndex_, uint256 amount_) external {
        uint256 withdrawn_ = IDistributor(distributor).withdraw(rewardPoolIndex_, amount_);
        IERC20(depositToken).transfer(msg.sender, withdrawn_);
    }

    function sendMintMessage(
        uint256 rewardPoolIndex_,
        address user_,
        uint256 amount_,
        address refundTo_
    ) external payable {
        IDistributor(distributor).sendMintMessage(rewardPoolIndex_, user_, amount_, refundTo_);
    }
}
