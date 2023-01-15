//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/interfaces/IERC1271.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract TestERC1271Wallet is IERC1271 {
    address key;
    event ValidateSucc(bytes4);

    constructor(address _key) {
        key = _key;
    }

    function isValidSignature(bytes32 _hash, bytes calldata _signature) external view override returns (bytes4 magicValue) {
        address addr = ECDSA.recover(_hash, _signature);
        if (addr == key) {
            magicValue = 0x1626ba7e;
        }
    }
}
