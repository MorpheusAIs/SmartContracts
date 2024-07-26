// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * This is extension for the Distribution contract that calculate total potential minted amount.
 */
interface IDistributionExt {
    /**
     * The function to set Distribution contract address.
     * @param distribution_ The Distribution contract address.
     */
    function setDistribution(address distribution_) external;

    /**
     * The function to set pool ids for the Distribution contract.
     * @param poolIds_ The pool's id.
     */
    function setPoolIds(uint256[] memory poolIds_) external;

    /**
     * The function calculate total potential reward amount for the current timestamp.
     */
    function getTotalRewards() external view returns (uint256);
}
