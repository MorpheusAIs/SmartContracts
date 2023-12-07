// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

import "./interfaces/IL1GatewayRouter.sol";

contract Bridge is ERC165, Ownable {
    using SafeERC20 for IERC20;

    address public l1GatewayRouter;
    address public token;

    constructor(address _l1GatewayRouter, address _token) {
        l1GatewayRouter = _l1GatewayRouter;
        token = _token;
    }

    function bridgeTokensRefund(
        uint256 amount,
        address recipient,
        uint256 gasLimit,
        uint256 maxFeePerGas,
        uint256 maxSubmissionCost
    ) external payable returns (bytes memory) {
        IERC20(token).safeTransferFrom(_msgSender(), address(this), amount);
        IERC20(token).approve(IL1GatewayRouter(l1GatewayRouter).getGateway(token), amount);

        bytes memory data = abi.encode(maxSubmissionCost, "");

        return
            IL1GatewayRouter(l1GatewayRouter).outboundTransferCustomRefund{value: msg.value}(
                token,
                recipient,
                recipient,
                amount,
                gasLimit,
                maxFeePerGas,
                data
            );
    }

    function bridgeTokens(
        uint256 amount,
        address recipient,
        uint256 gasLimit,
        uint256 maxFeePerGas,
        uint256 maxSubmissionCost
    ) external payable returns (bytes memory) {
        IERC20(token).safeTransferFrom(_msgSender(), address(this), amount);
        IERC20(token).approve(IL1GatewayRouter(l1GatewayRouter).getGateway(token), amount);

        bytes memory data = abi.encode(maxSubmissionCost, "");

        return
            IL1GatewayRouter(l1GatewayRouter).outboundTransfer{value: msg.value}(
                token,
                recipient,
                amount,
                gasLimit,
                maxFeePerGas,
                data
            );
    }
}
