// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {AavePoolDataProviderMock} from "./aave/AavePoolDataProviderMock.sol";
import {AavePoolMock} from "./aave/AavePoolMock.sol";

import {IDistributor, IERC165} from "../../interfaces/capital-protocol/IDistributor.sol";
import {IL1SenderV2} from "../../interfaces/capital-protocol/IL1SenderV2.sol";

import "../tokens/ERC20Token.sol";

contract DistributorMock {
    using SafeERC20 for IERC20;

    address public rewardPool;
    address public rewardToken;
    address public aavePoolMock;

    mapping(address => IDistributor.DepositPool) public depositPools;

    uint256 public distributedRewardsAnswer;

    constructor(address rewardPool_, address rewardToken_) {
        rewardPool = rewardPool_;
        rewardToken = rewardToken_;
    }

    function supportsInterface(bytes4 interfaceId_) external pure returns (bool) {
        return interfaceId_ == type(IDistributor).interfaceId || interfaceId_ == type(IERC165).interfaceId;
    }

    function setAavePoolMock(address aavePoolMock_) external {
        aavePoolMock = aavePoolMock_;
    }

    function addDepositPool(
        address depositPoolAddress_,
        address depositToken_,
        IDistributor.Strategy strategy_
    ) external {
        IDistributor.DepositPool memory depositPool_ = IDistributor.DepositPool(
            depositToken_,
            "",
            0,
            0,
            0,
            strategy_,
            address(0),
            true
        );

        if (strategy_ == IDistributor.Strategy.AAVE) {
            IERC20(depositToken_).safeApprove(aavePoolMock, type(uint256).max);

            (address aToken_, , ) = AavePoolDataProviderMock(AavePoolMock(aavePoolMock).aavePoolDataProviderMock())
                .getReserveTokensAddresses(depositToken_);
            IERC20(aToken_).approve(aavePoolMock, type(uint256).max);
        }

        depositPools[depositPoolAddress_] = depositPool_;
    }

    function distributeRewards(uint256 rewardPoolIndex_) external {}

    function setDistributedRewardsAnswer(uint256 value_) external {
        distributedRewardsAnswer = value_;
    }

    function getDistributedRewards(
        uint256 rewardPoolIndex_,
        address depositPoolAddress_
    ) external view returns (uint256) {
        uint256 preventWarnings_ = rewardPoolIndex_ + uint256(uint160(depositPoolAddress_));

        return distributedRewardsAnswer + preventWarnings_ - preventWarnings_;
    }

    function sendMintMessage(
        uint256 rewardPoolIndex_,
        address user_,
        uint256 amount_,
        address refundTo_
    ) external payable {
        uint256 preventWarnings_ = uint256(uint160(refundTo_)) + rewardPoolIndex_;

        ERC20Token(rewardToken).mint(user_, amount_ + preventWarnings_ - preventWarnings_);
    }

    function sendMintMessageToL1Sender(
        address l1Sender_,
        address user_,
        uint256 amount_,
        address refundTo_
    ) external payable {
        IL1SenderV2(l1Sender_).sendMintMessage{value: msg.value}(user_, amount_, refundTo_);
    }

    function supply(uint256 rewardPoolIndex_, uint256 amount_) external {
        uint256 preventWarnings_ = rewardPoolIndex_;

        IERC20(depositPools[msg.sender].token).safeTransferFrom(
            msg.sender,
            address(this),
            amount_ + preventWarnings_ - preventWarnings_
        );

        if (depositPools[msg.sender].strategy == IDistributor.Strategy.AAVE) {
            AavePoolMock(aavePoolMock).supply(depositPools[msg.sender].token, amount_, address(0), 0);
        }
    }

    function withdraw(uint256 rewardPoolIndex_, uint256 amount_) external returns (uint256) {
        uint256 preventWarnings_ = rewardPoolIndex_;

        if (depositPools[msg.sender].strategy == IDistributor.Strategy.AAVE) {
            AavePoolMock(aavePoolMock).withdraw(depositPools[msg.sender].token, amount_, address(this));
        }

        IERC20(depositPools[msg.sender].token).safeTransfer(msg.sender, amount_ + preventWarnings_ - preventWarnings_);

        return amount_;
    }
}
