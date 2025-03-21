// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract AavePoolDataProviderMock {
    mapping(address => address) public aTokenAddresses;

    function setATokenAddress(address asset_, address aTokenAddress_) external {
        aTokenAddresses[asset_] = aTokenAddress_;
    }

    function getReserveTokensAddresses(
        address asset_
    )
        external
        view
        returns (address aTokenAddress_, address stableDebtTokenAddress_, address variableDebtTokenAddress_)
    {
        aTokenAddress_ = aTokenAddresses[asset_];
        stableDebtTokenAddress_ = asset_;
        variableDebtTokenAddress_ = asset_;
    }
}
