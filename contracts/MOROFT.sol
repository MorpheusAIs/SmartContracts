// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {OFT} from "./@layerzerolabs/lz-evm-oapp-v2/contracts/oft/OFT.sol";

import {IMOROFT, IERC20, IERC165, IOAppCore} from "./interfaces/IMOROFT.sol";

contract MOROFT is IMOROFT, OFT {
    address private immutable _minter;

    constructor(
        address layerZeroEndpoint_,
        address delegate_,
        address minter_
    ) OFT("MOR", "MOR", layerZeroEndpoint_, delegate_) {
        require(minter_ != address(0), "MOROFT: invalid minter");

        _minter = minter_;

        transferOwnership(delegate_);
    }

    function supportsInterface(bytes4 interfaceId_) external pure returns (bool) {
        return
            interfaceId_ == type(IMOROFT).interfaceId ||
            interfaceId_ == type(IERC20).interfaceId ||
            interfaceId_ == type(IOAppCore).interfaceId ||
            interfaceId_ == type(IERC165).interfaceId;
    }

    function minter() public view returns (address) {
        return _minter;
    }

    function mint(address account_, uint256 amount_) public {
        require(_msgSender() == minter(), "MOROFT: invalid caller");

        _mint(account_, amount_);
    }

    function burn(uint256 amount_) public virtual {
        _burn(_msgSender(), amount_);
    }

    function burnFrom(address account_, uint256 amount_) public virtual {
        _spendAllowance(account_, _msgSender(), amount_);
        _burn(account_, amount_);
    }
}
