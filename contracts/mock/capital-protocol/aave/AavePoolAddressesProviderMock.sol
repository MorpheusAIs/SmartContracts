// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract AavePoolAddressesProviderMock {
    address public pool;

    function setPool(address value_) external {
        pool = value_;
    }

    function getPool() external view returns (address) {
        return pool;
    }
}
