// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

interface IBridge {
    struct LzConfig {
        address lzEndpoint;
        address communicator;
        uint16 communicatorChainId;
    }
}
