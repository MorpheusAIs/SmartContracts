// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

interface IL1Sender {
    struct LzConfig {
        address lzEndpoint;
        address communicator;
        uint16 communicatorChainId;
    }
}
