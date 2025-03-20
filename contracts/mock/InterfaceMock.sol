// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IBuilderSubnets, IERC165} from "../interfaces/builder-subnets/IBuilderSubnets.sol";
import {IDepositPool} from "../interfaces/capital-protocol/IDepositPool.sol";
import {IRewardPool} from "../interfaces/capital-protocol/IRewardPool.sol";
import {IChainLinkDataConsumer} from "../interfaces/capital-protocol/IChainLinkDataConsumer.sol";
import {IDistributor} from "../interfaces/capital-protocol/IDistributor.sol";

contract InterfaceMock {
    function getIBuilderSubnetsInterfaceId() public pure returns (bytes4) {
        return type(IBuilderSubnets).interfaceId;
    }

    function getIDepositPoolInterfaceId() public pure returns (bytes4) {
        return type(IDepositPool).interfaceId;
    }

    function getIRewardPoolInterfaceId() public pure returns (bytes4) {
        return type(IRewardPool).interfaceId;
    }

    function getIChainLinkDataConsumerInterfaceId() public pure returns (bytes4) {
        return type(IChainLinkDataConsumer).interfaceId;
    }

    function getIDistributorInterfaceId() public pure returns (bytes4) {
        return type(IDistributor).interfaceId;
    }

    function getIERC165InterfaceId() public pure returns (bytes4) {
        return type(IERC165).interfaceId;
    }

    function version() external pure returns (uint256) {
        return 999;
    }
}
