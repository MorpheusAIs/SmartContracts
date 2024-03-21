// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {OptionsBuilder} from "./../@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/libs/OptionsBuilder.sol";

contract OptionsBuilderMock {
    using OptionsBuilder for bytes;

    function addExecutorLzReceiveOption(
        bytes memory _options,
        uint128 _gas,
        uint128 _value
    ) public pure returns (bytes memory) {
        return _options.addExecutorLzReceiveOption(_gas, _value);
    }
}
