// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

contract GatewayRouterMock {
    address public gateway;

    constructor(address gateway_) {
        gateway = gateway_;
    }

    function getGateway(address) external view returns (address) {
        return gateway;
    }
}
