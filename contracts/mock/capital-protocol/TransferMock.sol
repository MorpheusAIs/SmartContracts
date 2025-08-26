// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract TransferMock {
    using SafeERC20 for IERC20;

    uint256 public transferredAmount;

    function initialTransfer(
        address token_,
        uint256 initialAmount_,
        address receiver1_,
        address receiver2_,
        address receiver3_
    ) external {
        uint256 balanceBefore_ = IERC20(token_).balanceOf(address(this));
        IERC20(token_).safeTransferFrom(msg.sender, address(this), initialAmount_);
        uint256 balanceAfter_ = IERC20(token_).balanceOf(address(this));

        uint256 amount_ = balanceAfter_ - balanceBefore_;

        transferredAmount = amount_;

        IERC20(token_).safeTransfer(receiver1_, amount_);
        TransferMock(receiver1_).transfer(token_, amount_, receiver2_, receiver3_);
    }

    function transfer(address token_, uint256 amount_, address receiver2_, address receiver3_) external {
        IERC20(token_).safeTransfer(receiver2_, amount_);

        TransferMock(receiver2_).finalTransfer(token_, amount_, receiver3_);
    }

    function finalTransfer(address token_, uint256 amount_, address receiver3_) external {
        IERC20(token_).safeTransfer(receiver3_, amount_);
    }
}
