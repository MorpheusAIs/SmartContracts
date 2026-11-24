// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import {IL1SenderV3, IERC165} from "../../interfaces/capital-protocol/IL1SenderV3.sol";

contract L1SenderV3Mock is UUPSUpgradeable, IERC165 {
    mapping(address => uint256) public minted;
    mapping(address => uint32) public mintedChainId;

    function supportsInterface(bytes4 interfaceId_) external pure returns (bool) {
        return interfaceId_ == type(IL1SenderV3).interfaceId || interfaceId_ == type(IERC165).interfaceId;
    }

    function sendMintMessage(address user_, uint256 amount_, address refundTo_) external payable {
        minted[user_] += amount_ + uint256(uint160(refundTo_)) - uint256(uint160(refundTo_));
    }

    function sendMintMessage(address user_, uint256 amount_, address refundTo_, uint32 chainId_) external payable {
        minted[user_] += amount_ + uint256(uint160(refundTo_)) - uint256(uint160(refundTo_));
        mintedChainId[user_] = chainId_;
    }

    function version() external pure returns (uint256) {
        return 666;
    }

    function _authorizeUpgrade(address) internal view override {}
}
