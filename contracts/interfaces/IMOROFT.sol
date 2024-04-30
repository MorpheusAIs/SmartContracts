// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IOAppCore} from ".././@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/interfaces/IOAppCore.sol";

interface IMOROFT is IERC20, IERC165 {
    /**
     * @notice The function update `minter` addresses.
     *
     * @param minter_ The upadted minter address.
     * @param status_ The new status. True or false.
     */
    function updateMinter(address minter_, bool status_) external;

    /**
     * @notice The function to mint tokens.
     *
     * @param account_ The address of the account to mint tokens to.
     * @param amount_ The amount of tokens to mint.
     */
    function mint(address account_, uint256 amount_) external;

    /**
     * @notice The function to destroys `amount` tokens from the caller.
     * See {ERC20-_burn}.
     *
     * @param amount_ The amount of tokens to burn.
     */
    function burn(uint256 amount_) external;

    /**
     * @notice The function to destroys `amount` tokens from `account`, deducting from the caller's
     * allowance.
     *
     * @param account_ The address of the account to burn tokens from.
     * @param amount_ The amount of tokens to burn.
     */
    function burnFrom(address account_, uint256 amount_) external;
}
