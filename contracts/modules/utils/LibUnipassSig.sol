// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "./LibDkimAuth.sol";
import "../../utils/LibSignatureValidator.sol";
import "../../utils/LibBytes.sol";

import "hardhat/console.sol";

library LibUnipassSig {
    using LibBytes for bytes;

    enum KeyType {
        Secp256k1,
        ERC1271Wallet,
        EmailAddress
    }

    bytes4 internal constant SELECTOR_ERC1271_BYTES32_BYTES = 0x1626ba7e;

    error InvalidKeyType(KeyType _keyType);

    function _subDigest(bytes32 _digest, uint256 _chainId) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", _chainId, address(this), _digest));
    }

    function _parseKey(
        IDkimKeys _dkimKeys,
        bytes32 _hash,
        bytes calldata _signature,
        uint256 _index
    )
        internal
        view
        returns (
            bool isSig,
            KeyType keyType,
            bytes32 ret,
            uint256 index
        )
    {
        keyType = (KeyType)(_signature.mcReadUint8(_index));
        index = _index + 1;
        if (keyType == KeyType.Secp256k1) {
            address key;
            isSig = _signature.mcReadUint8(index) == 1;
            ++index;
            if (isSig) {
                key = LibSignatureValidator.recoverSigner(_hash, _signature[index:index + 66]);
                index += 66;
            } else {
                (key, index) = _signature.cReadAddress(index);
            }
            ret = bytes32(uint256(uint160(key)));
        } else if (keyType == KeyType.ERC1271Wallet) {
            isSig = _signature.mcReadUint8(index) == 1;
            ++index;
            address key;
            (key, index) = _signature.cReadAddress(index);
            if (isSig) {
                uint32 sigLen;
                (sigLen, index) = _signature.cReadUint32(index);
                bytes calldata sig = _signature[index:index + sigLen];
                index += sigLen;
                require(
                    IERC1271(key).isValidSignature(_hash, sig) == SELECTOR_ERC1271_BYTES32_BYTES,
                    "_validateSignature: VALIDATE_FAILED"
                );
            }
            ret = bytes32(uint256(uint160(key)));
        } else if (keyType == KeyType.EmailAddress) {
            isSig = _signature.mcReadUint8(index) == 1;
            ++index;

            if (isSig) {
                bool succ;
                bytes memory sigHashHex;
                bytes32 pepper = _signature.mcReadBytes32(index);
                index += 32;
                (succ, ret, sigHashHex, index) = LibDkimAuth._dkimVerify(_dkimKeys, _signature, index, pepper);
                require(succ, "_validateSignature: INVALID_DKIM");
                require(
                    keccak256((LibBytes.toHex(uint256(_hash), 32))) == keccak256(sigHashHex),
                    "_validateSignature: INVALID_SIG_HASH"
                );
            } else {
                ret = _signature.mcReadBytes32(index);
                index += 32;
            }
        } else {
            revert InvalidKeyType(keyType);
        }
    }
}
