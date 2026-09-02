// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Forces Hardhat to compile LayerZero's official test-only message library, so it's available via
// `ethers.getContractFactory('SimpleMessageLib')` in tests exercising `LayerZeroEndpointV2Mock`.
import {SimpleMessageLib} from "@layerzerolabs/lz-evm-protocol-v2/contracts/messagelib/SimpleMessageLib.sol";
