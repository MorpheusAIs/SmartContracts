// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

interface IL2MessageReceiver {
    struct Config {
        address gateway;
        address sender;
        uint16 senderChainId;
    }
}
