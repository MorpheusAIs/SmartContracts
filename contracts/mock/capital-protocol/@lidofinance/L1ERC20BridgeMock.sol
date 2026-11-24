// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract L1ERC20BridgeMock {
    uint256 preventWarning;

    function l2Token() external view returns (address) {
        return address(this);
    }

    function depositERC20To(
        address l1Token_,
        address l2Token_,
        address to_,
        uint256 amount_,
        uint32 l2Gas_,
        bytes calldata data_
    ) external {
        IERC20(l1Token_).transferFrom(msg.sender, to_, amount_);

        preventWarning = uint256(uint160(l2Token_)) + l2Gas_ + uint256(uint160(bytes20(data_)));
    }
}
