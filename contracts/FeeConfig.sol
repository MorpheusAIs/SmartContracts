// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import {PRECISION} from "@solarity/solidity-lib/utils/Globals.sol";

import {IFeeConfig} from "./interfaces/IFeeConfig.sol";

contract FeeConfig is IFeeConfig, OwnableUpgradeable, UUPSUpgradeable {
    address public treasury;
    uint256 public baseFee;
    uint256 public baseFeeForOperation;

    mapping(address => uint256) public fees;
    mapping(address => mapping(string => uint256)) public feeForOperations;

    constructor() {
        _disableInitializers();
    }

    function FeeConfig_init(address treasury_, uint256 baseFee_) external initializer {
        __Ownable_init();

        setBaseFee(baseFee_);
        setTreasury(treasury_);
    }

    function setFee(address sender_, uint256 fee_) external onlyOwner {
        require(fee_ <= PRECISION, "FC: invalid fee");

        fees[sender_] = fee_;
    }

    function setTreasury(address treasury_) public onlyOwner {
        require(treasury_ != address(0), "FC: invalid treasury");

        treasury = treasury_;
    }

    function setBaseFee(uint256 baseFee_) public onlyOwner {
        require(baseFee_ <= PRECISION, "FC: invalid base fee");

        baseFee = baseFee_;
    }

    function getFeeAndTreasury(address sender_) external view returns (uint256, address) {
        uint256 fee_ = fees[sender_];
        if (fee_ == 0) {
            fee_ = baseFee;
        }

        return (fee_, treasury);
    }

    function getFeeAndTreasuryForOperation(
        address sender_,
        string memory operation_
    ) external view returns (uint256, address) {
        uint256 fee_ = feeForOperations[sender_][operation_];
        if (fee_ == 0) {
            fee_ = baseFeeForOperation;
        }

        return (fee_, treasury);
    }

    function _authorizeUpgrade(address) internal view override onlyOwner {}
}
