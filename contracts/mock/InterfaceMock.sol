// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IBuilderSubnets, IERC165} from "../interfaces/builder-subnets/IBuilderSubnets.sol";

contract InterfaceMock {
    function getIBuilderSubnetsInterfaceId() public pure returns (bytes4) {
        return type(IBuilderSubnets).interfaceId;
    }

    function getIERC165InterfaceId() public pure returns (bytes4) {
        return type(IERC165).interfaceId;
    }
}
