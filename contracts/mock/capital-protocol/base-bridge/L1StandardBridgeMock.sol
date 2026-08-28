// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract L1StandardBridgeMock {
    function bridgeERC20To(
        address _localToken,
        address,
        address _to,
        uint256 _amount,
        uint32,
        bytes calldata
    ) external {
        IERC20(_localToken).transferFrom(msg.sender, _to, _amount);
    }
}
