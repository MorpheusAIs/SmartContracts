// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {LZEndpointMock} from "@layerzerolabs/solidity-examples/contracts/lzApp/mocks/LZEndpointMock.sol";

import {Distribution} from "../Distribution.sol";

contract DistributionV2 is Distribution {
    function version() external pure returns (uint256) {
        return 2;
    }
}
