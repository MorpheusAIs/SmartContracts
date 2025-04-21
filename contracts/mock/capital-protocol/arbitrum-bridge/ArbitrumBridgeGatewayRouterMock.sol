// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ArbitrumBridgeGatewayRouterMock {
    function outboundTransfer(
        address _token,
        address _to,
        uint256 _amount,
        uint256 _maxGas,
        uint256 _gasPriceBid,
        bytes calldata _data
    ) external payable returns (bytes memory) {
        IERC20(_token).transferFrom(msg.sender, _to, _amount);

        return abi.encode(_token, _to, _amount, _maxGas, _gasPriceBid, _data);
    }

    function getGateway(address) external view returns (address) {
        return address(this);
    }
}
