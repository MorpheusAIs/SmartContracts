// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import {PRECISION} from "@solarity/solidity-lib/utils/Globals.sol";

import {IFeeConfig, IERC165} from "../interfaces/builder-protocol/IFeeConfig.sol";

contract FeeConfig is IFeeConfig, OwnableUpgradeable, UUPSUpgradeable {
    address private _treasury;

    uint256 private _baseFee;
    mapping(bytes32 => uint256) private _baseFeeForOperations;

    mapping(address => uint256) private _fees;

    mapping(address => mapping(bytes32 => uint256)) private _feeForOperations;
    mapping(address => mapping(bytes32 => bool)) private _feeForOperationIsSet;

    constructor() {
        _disableInitializers();
    }

    function FeeConfig_init(address treasury_, uint256 baseFee_) external initializer {
        __Ownable_init();

        setBaseFee(baseFee_);
        setTreasury(treasury_);
    }

    function supportsInterface(bytes4 interfaceId_) external pure override returns (bool) {
        return interfaceId_ == type(IFeeConfig).interfaceId || interfaceId_ == type(IERC165).interfaceId;
    }

    function setFee(address sender_, uint256 fee_) external onlyOwner {
        require(fee_ < PRECISION, "FC: invalid fee");

        _fees[sender_] = fee_;

        emit FeeSet(sender_, fee_);
    }

    function setFeeForOperation(address sender_, bytes32 operation_, uint256 fee_) external onlyOwner {
        require(fee_ < PRECISION, "FC: invalid fee");

        _feeForOperations[sender_][operation_] = fee_;
        _feeForOperationIsSet[sender_][operation_] = true;

        emit FeeForOperationSet(sender_, operation_, fee_);
    }

    function discardCustomFee(address sender_, bytes32 operation_) external onlyOwner {
        _feeForOperationIsSet[sender_][operation_] = false;

        emit FeeForOperationDiscarded(sender_, operation_);
    }

    function setTreasury(address treasury_) public onlyOwner {
        require(treasury_ != address(0), "FC: invalid treasury");

        _treasury = treasury_;

        emit TreasurySet(treasury_);
    }

    function setBaseFee(uint256 baseFee_) public onlyOwner {
        require(baseFee_ < PRECISION, "FC: invalid base fee");

        _baseFee = baseFee_;

        emit BaseFeeSet(baseFee_);
    }

    function setBaseFeeForOperation(bytes32 operation_, uint256 baseFeeForOperation_) public onlyOwner {
        require(baseFeeForOperation_ < PRECISION, "FC: invalid base fee for op");

        _baseFeeForOperations[operation_] = baseFeeForOperation_;

        emit BaseFeeForOperationSet(operation_, baseFeeForOperation_);
    }

    function getFeeAndTreasury(address sender_) external view returns (uint256, address) {
        uint256 fee_ = _fees[sender_];
        if (fee_ == 0) {
            fee_ = _baseFee;
        }

        return (fee_, _treasury);
    }

    function getFeeAndTreasuryForOperation(
        address sender_,
        bytes32 operation_
    ) external view returns (uint256, address) {
        uint256 fee_;
        if (_feeForOperationIsSet[sender_][operation_]) {
            fee_ = _feeForOperations[sender_][operation_];
        } else {
            fee_ = _baseFeeForOperations[operation_];
        }

        return (fee_, _treasury);
    }

    function _authorizeUpgrade(address) internal view override onlyOwner {}
}
