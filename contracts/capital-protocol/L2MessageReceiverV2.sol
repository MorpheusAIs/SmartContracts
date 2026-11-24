// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

import {OAppReceiver, OAppCore, Origin} from "../@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/OAppReceiver.sol";
import {IOAppCore} from "../@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/interfaces/IOAppCore.sol";

import {IL2MessageReceiverV2} from "../interfaces/capital-protocol/IL2MessageReceiverV2.sol";
import {IMOROFT} from "../interfaces/IMOROFT.sol";

/**
 * @dev Receives the reward token mint message from `L1SenderV2` on Ethereum via LayerZero V2
 * and mints `rewardToken` to the specified user. One instance is deployed per destination
 * network (Arbitrum, Base, ...); the contract is intentionally not upgradeable, mirroring the
 * `MOROFT` deployment model (see `contracts/MOROFT.sol`), and holds no funds.
 *
 * Replaces the legacy LayerZero V1 `old/L2MessageReceiver.sol` for new deployments; the old
 * contract is left untouched and simply stops being a `MOROFT` minter once this one is verified.
 * @custom:security-contact devs@mor.org
 */
contract L2MessageReceiverV2 is IL2MessageReceiverV2, OAppReceiver {
    address public rewardToken;

    constructor(address endpoint_, address delegate_, address rewardToken_) OAppCore(endpoint_, delegate_) {
        setRewardToken(rewardToken_);

        transferOwnership(delegate_);
    }

    function supportsInterface(bytes4 interfaceId_) external pure returns (bool) {
        return
            interfaceId_ == type(IL2MessageReceiverV2).interfaceId ||
            interfaceId_ == type(IOAppCore).interfaceId ||
            interfaceId_ == type(IERC165).interfaceId;
    }

    function setRewardToken(address value_) public onlyOwner {
        require(IERC165(value_).supportsInterface(type(IMOROFT).interfaceId), "MR: invalid reward token address");

        rewardToken = value_;

        emit RewardTokenSet(value_);
    }

    function _lzReceive(
        Origin calldata origin_,
        bytes32 /*guid_*/,
        bytes calldata message_,
        address /*executor_*/,
        bytes calldata /*extraData_*/
    ) internal override {
        (address user_, uint256 amount_) = abi.decode(message_, (address, uint256));

        IMOROFT(rewardToken).mint(user_, amount_);

        emit MintMessageReceived(origin_.srcEid, user_, amount_);
    }
}
