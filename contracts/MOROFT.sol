// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {OFT} from "./@layerzerolabs/lz-evm-oapp-v2/contracts/oft/OFT.sol";

import {IMOROFT, IERC20, IERC165, IOAppCore} from "./interfaces/IMOROFT.sol";

contract MOROFT is IMOROFT, OFT {
    address private immutable minter_;

    constructor(
        address _layerZeroEndpoint,
        address _delegate,
        address _minter
    ) OFT("MOR", "MOR", _layerZeroEndpoint, _delegate) {
        require(_minter != address(0), "MOROFT: invalid minter");

        minter_ = _minter;

        transferOwnership(_delegate);
    }

    function supportsInterface(bytes4 interfaceId_) external pure returns (bool) {
        return
            interfaceId_ == type(IMOROFT).interfaceId ||
            interfaceId_ == type(IERC20).interfaceId ||
            interfaceId_ == type(IOAppCore).interfaceId ||
            interfaceId_ == type(IERC165).interfaceId;
    }

    function minter() public view returns (address) {
        return minter_;
    }

    function mint(address _account, uint256 _amount) public {
        require(_msgSender() == minter(), "MOROFT: invalid caller");

        _mint(_account, _amount);
    }

    function burn(uint256 _amount) public virtual {
        _burn(_msgSender(), _amount);
    }

    function burnFrom(address _account, uint256 _amount) public virtual {
        _spendAllowance(_account, _msgSender(), _amount);
        _burn(_account, _amount);
    }
}
