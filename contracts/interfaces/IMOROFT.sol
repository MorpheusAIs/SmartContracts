// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IOAppCore} from ".././@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/interfaces/IOAppCore.sol";

interface IMOROFT is IERC20, IERC165 {
    function minter() external view returns (address);

    function mint(address account_, uint256 amount_) external;

    function burn(uint256 amount_) external;

    function burnFrom(address account_, uint256 amount_) external;
}
