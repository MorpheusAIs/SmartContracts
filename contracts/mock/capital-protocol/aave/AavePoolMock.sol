// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./AavePoolDataProviderMock.sol";
import "../../tokens/ERC20Token.sol";

contract AavePoolMock {
    address aavePoolDataProviderMock;

    constructor(address aavePoolDataProviderMock_) {
        aavePoolDataProviderMock = aavePoolDataProviderMock_;
    }

    function supply(address asset_, uint256 amount_, address onBehalfOf_, uint16 referralCode_) external {
        uint256 preventWarnings_ = uint256(uint160(onBehalfOf_)) + referralCode_;

        address aToken_ = AavePoolDataProviderMock(aavePoolDataProviderMock).aTokenAddresses(asset_);
        ERC20Token(asset_).transferFrom(msg.sender, address(this), amount_);
        ERC20Token(aToken_).mint(msg.sender, amount_ + preventWarnings_ - preventWarnings_);
    }

    function withdraw(address asset_, uint256 amount_, address to_) external returns (uint256) {
        address aToken_ = AavePoolDataProviderMock(aavePoolDataProviderMock).aTokenAddresses(asset_);
        ERC20Token(aToken_).transferFrom(msg.sender, address(this), amount_);
        ERC20Token(asset_).transfer(to_, amount_);

        return amount_;
    }
}
