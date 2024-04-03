// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import {OptionsBuilder} from "./../@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/libs/OptionsBuilder.sol";

/// @dev This contract demonstrates how to generate various execution options for LayerZero messages.
/// Use this contract as a template for generating your own options to pass in your LayerZero send calls.
contract OptionsGenerator {
    using OptionsBuilder for bytes;

    /// @notice Creates options for executing `lzReceive` on the destination chain.
    /// @param _gas The gas amount for the `lzReceive` execution.
    /// @param _value The msg.value for the `lzReceive` execution.
    /// @return bytes-encoded option set for `lzReceive` executor.
    function createLzReceiveOption(uint128 _gas, uint128 _value) public pure returns (bytes memory) {
        return OptionsBuilder.newOptions().addExecutorLzReceiveOption(_gas, _value);
    }

    /// @notice Creates options for executing `lzCompose` on the destination chain.
    /// @param _index The composed message's index for the `lzCompose` execution.
    /// @param _gas The gas amount for the `lzCompose` execution.
    /// @param _value The msg.value for the `lzCompose` execution.
    /// @return bytes-encoded option set for `lzCompose` executor.
    function createLzComposeOption(uint16 _index, uint128 _gas, uint128 _value) public pure returns (bytes memory) {
        return OptionsBuilder.newOptions().addExecutorLzComposeOption(_index, _gas, _value);
    }

    /// @notice Creates options for dropping a specific amount of native gas to a receiver on the destination chain.
    /// @param _amount The amount of native gas to drop.
    /// @param _receiver The address (as a bytes32) of the receiver on the destination chain.
    /// @return bytes-encoded option set for native gas dropping by the executor.
    function createLzNativeDropOption(uint128 _amount, bytes32 _receiver) public pure returns (bytes memory) {
        return OptionsBuilder.newOptions().addExecutorNativeDropOption(_amount, _receiver);
    }

    /// @notice Creates a combined set of options for multiple execution types in a single LayerZero message.
    /// @param _receiveGas The gas amount for the `lzReceive` execution.
    /// @param _receiveValue The msg.value for the `lzReceive` execution.
    /// @param _composeIndex The composed message's index for the `lzCompose` execution.
    /// @param _composeGas The gas amount for the `lzCompose` execution.
    /// @param _composeValue The msg.value for the `lzCompose` execution.
    /// @param _dropAmount The amount of native gas to drop.
    /// @param _dropReceiver The address (as a bytes32) of the receiver for the gas drop.
    /// @return bytes-encoded combination of `lzReceive`, `lzCompose`, and native gas drop options.
    function createCombinedOptions(
        uint128 _receiveGas,
        uint128 _receiveValue,
        uint16 _composeIndex,
        uint128 _composeGas,
        uint128 _composeValue,
        uint128 _dropAmount,
        bytes32 _dropReceiver
    ) public pure returns (bytes memory) {
        return
            OptionsBuilder
                .newOptions()
                .addExecutorLzReceiveOption(_receiveGas, _receiveValue)
                .addExecutorLzComposeOption(_composeIndex, _composeGas, _composeValue)
                .addExecutorNativeDropOption(_dropAmount, _dropReceiver);
    }
}
