// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

import {IInbox} from "@arbitrum/nitro-contracts/src/bridge/IInbox.sol";

import {IGatewayRouter} from "@arbitrum/token-bridge-contracts/contracts/tokenbridge/libraries/gateway/IGatewayRouter.sol";

import {IMOR} from "./interfaces/IMOR.sol";

contract Bridge is ERC165, Ownable {
    using SafeERC20 for IERC20;

    address public l1GatewayRouter;
    address public inbox;
    address public investToken;
    address public rewardToken;

    constructor(address l1GatewayRouter_, address inbox_, address investToken_, address rewardToken_) {
        l1GatewayRouter = l1GatewayRouter_;
        inbox = inbox_;
        investToken = investToken_;
        rewardToken = rewardToken_;
    }

    function bridgeInvestTokens(
        uint256 amount,
        address recipient,
        uint256 gasLimit,
        uint256 maxFeePerGas,
        uint256 maxSubmissionCost
    ) external payable returns (bytes memory) {
        IERC20(investToken).safeTransferFrom(_msgSender(), address(this), amount);
        IERC20(investToken).approve(IGatewayRouter(l1GatewayRouter).getGateway(investToken), amount);

        bytes memory data = abi.encode(maxSubmissionCost, "");

        return
            IGatewayRouter(l1GatewayRouter).outboundTransfer{value: msg.value}(
                investToken,
                recipient,
                amount,
                gasLimit,
                maxFeePerGas,
                data
            );
    }

    function sendMintRequestToL2(
        address recipient,
        uint256 amount,
        uint256 maxSubmissionCost,
        uint256 maxGas,
        uint256 gasPriceBid
    ) external payable returns (uint256) {
        bytes memory data = abi.encodeWithSelector(IMOR.mint.selector, recipient, amount);
        return
            IInbox(inbox).createRetryableTicket{value: msg.value}(
                rewardToken,
                0,
                maxSubmissionCost,
                msg.sender,
                msg.sender,
                maxGas,
                gasPriceBid,
                data
            );
    }
}
