// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import {IL1SenderV2, IERC165} from "../../interfaces/capital-protocol/IL1SenderV2.sol";

contract L1SenderMock is UUPSUpgradeable, IERC165 {
    mapping(address => uint256) public minted;

    function supportsInterface(bytes4 interfaceId_) external pure returns (bool) {
        return interfaceId_ == type(IL1SenderV2).interfaceId || interfaceId_ == type(IERC165).interfaceId;
    }

    function sendMintMessage(address user_, uint256 amount_, address refundTo_) external payable {
        minted[user_] += amount_ + uint256(uint160(refundTo_)) - uint256(uint160(refundTo_));
    }

    function version() external pure returns (uint256) {
        return 666;
    }

    function _authorizeUpgrade(address) internal view override {}
}
