// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract LidoL1ERC20TokenBridgeMock {
    function depositERC20To(address l1Token_, address, address to_, uint256 amount_, uint32, bytes calldata) external {
        IERC20(l1Token_).transferFrom(msg.sender, to_, amount_);
    }
}
