// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IDistributionV5} from "../capital-protocol/old/IDistributionV5.sol";

/**
 * This is the Distribution contract that stores all the pools and users data.
 * It is used to calculate the user's rewards and operate with overpluses.
 */
interface IDistributionV6 is IDistributionV5 {
    event AddressAllowedToClaimSet(address holder, address caller, bool isAllowed);

    /**
     * The function to set the addresses which can claim for `msg.sender`
     * @param addresses_  The addresses list
     * @param isAllowed_ Allowed or not
     */
    function setAddressesAllowedToClaim(address[] calldata addresses_, bool[] calldata isAllowed_) external;

    /**
     * The function to claim rewards from the pool for the specified address.
     * @param poolId_ The pool's id.
     * @param user_ Specified address.
     * @param receiver_ The receiver's address.
     */
    function claimFor(uint256 poolId_, address user_, address receiver_) external payable;

    /**
     * The function to claim referrer rewards from the pool for the specified address.
     * @param poolId_ The pool's id.
     * @param referrer_ Specified address.
     * @param receiver_ The receiver's address.
     */
    function claimReferrerTierFor(uint256 poolId_, address referrer_, address receiver_) external payable;
}
