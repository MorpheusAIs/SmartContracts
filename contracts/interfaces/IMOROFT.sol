// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IOAppCore} from ".././@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/interfaces/IOAppCore.sol";

/**
 * This is the interface for MOROFT token contract. The token is ERC20 with burnable and Layer Zero OFT features.
 */
interface IMOROFT is IERC20, IERC165 {
    /**
     * The function to get the minter address.
     * @return The minter address.
     */
    function minter() external view returns (address);

    /**
     * The function to mint tokens.
     * @param account The address of the account to mint tokens to.
     * @param amount The amount of tokens to mint.
     */
    function mint(address account, uint256 amount) external;

    /**
     * The function to destroys `amount` tokens from the caller.
     * See {ERC20-_burn}.
     * @param amount The amount of tokens to burn.
     */
    function burn(uint256 amount) external;

    /**
     * The function to destroys `amount` tokens from `account`, deducting from the caller's
     * allowance.
     *
     * See {ERC20-_burn} and {ERC20-allowance}.
     *
     * Requirements:
     *
     * - the caller must have allowance for ``accounts``'s tokens of at least
     * `amount`.
     *
     * @param account The address of the account to burn tokens from.
     * @param amount The amount of tokens to burn.
     */
    function burnFrom(address account, uint256 amount) external;
}
