// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

interface IL1Sender {
    struct DepositTokenConfig {
        address token; // wstETH
        address gateway;
        address receiver;
    }

    struct RewardTokenConfig {
        address gateway;
        address receiver;
        uint16 receiverChainId;
    }
}
