// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import "./LibDkimAuth.sol";
import "./LibOpenIDAuth.sol";
import "../../utils/LibSignatureValidator.sol";
import "../../utils/LibBytes.sol";

import "hardhat/console.sol";

library LibUnipassSig {
    using LibBytes for bytes;

    enum KeyType {
        Secp256k1,
        ERC1271Wallet,
        OpenIDWithEmail
    }

    bytes4 internal constant SELECTOR_ERC1271_BYTES32_BYTES = 0x1626ba7e;
    uint8 private constant OPENID_EMAIL_SIG = 1;
    uint8 private constant OPENID_ID_TOKEN_SIG = 2;

    error InvalidKeyType(KeyType _keyType);
    error InvalidOpenIDWithEmailSig(uint8 _sigType);

    function _subDigest(bytes32 _digest, uint256 _chainId) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", _chainId, address(this), _digest));
    }

    function _parseKey(
        IDkimKeys _dkimKeys,
        IOpenID _openID,
        bytes32 _hash,
        bytes calldata _signature,
        uint256 _index
    )
        internal
        view
        returns (
            bool isSig,
            IDkimKeys.EmailType emailType,
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
        } else if (keyType == KeyType.OpenIDWithEmail) {
            (isSig, emailType, ret, index) = _parseKeyOpenIDWithEmail(_dkimKeys, _openID, _hash, index, _signature);
        } else {
            revert InvalidKeyType(keyType);
        }
    }

    function _parseKeyOpenIDWithEmail(
        IDkimKeys _dkimKeys,
        IOpenID _openID,
        bytes32 _hash,
        uint256 _index,
        bytes calldata _signature
    )
        private
        view
        returns (
            bool isSig,
            IDkimKeys.EmailType emailType,
            bytes32 ret,
            uint256 index
        )
    {
        index = _index;
        isSig = _signature.mcReadUint8(index) == 1;
        ++index;

        if (isSig) {
            uint8 sigType = _signature.mcReadUint8(index);
            ++index;
            if (sigType == OPENID_EMAIL_SIG) {
                (emailType, ret, index) = _validateEmailSig(_dkimKeys, _hash, index, _signature);
            } else if (sigType == OPENID_ID_TOKEN_SIG) {
                (ret, index) = _validateOpenIDSig(_openID, _hash, index, _signature);
            } else {
                revert InvalidOpenIDWithEmailSig(sigType);
            }
        } else {
            ret = _signature.mcReadBytes32(index);
            index += 32;
        }
    }

    function _validateEmailSig(
        IDkimKeys _dkimKeys,
        bytes32 _hash,
        uint256 _index,
        bytes calldata _signature
    )
        private
        view
        returns (
            IDkimKeys.EmailType emailType,
            bytes32 ret,
            uint256 index
        )
    {
        index = _index;
        bytes32 openIDHash = _signature.mcReadBytes32(index);
        index += 32;

        bool succ;
        bytes32 subjectHash;
        bytes32 emailHash;
        (succ, emailType, emailHash, subjectHash, index) = LibDkimAuth._dkimVerify(_dkimKeys, index, _signature);
        require(succ, "_parseKeyOpenIDWithEmail: INVALID_DKIM");
        require(keccak256((LibBytes.toHex(uint256(_hash), 32))) == subjectHash, "_parseKeyOpenIDWithEmail: INVALID_SIG_HASH");

        ret = keccak256(abi.encodePacked(emailHash, openIDHash));
    }

    function _validateOpenIDSig(
        IOpenID _openID,
        bytes32 _hash,
        uint256 _index,
        bytes calldata _signature
    ) private view returns (bytes32 ret, uint256 index) {
        index = _index;
        bytes32 emailHash = _signature.mcReadBytes32(index);
        index += 32;

        bool succ;
        bytes32 issHash;
        bytes32 subHash;
        bytes32 nonceHash;
        (succ, index, issHash, subHash, nonceHash) = LibOpenIDAuth._openIDVerify(_openID, index, _signature);
        require(succ, "_parseKeyOpenIDWithEmail: INVALID_OPENID");
        require(keccak256((LibBytes.toHex(uint256(_hash), 32))) == nonceHash, "_parseKeyOpenIDWithEmail: INVALID_NONCE_HASH");
        bytes32 openIDHash = keccak256(abi.encodePacked(issHash, subHash));
        ret = keccak256(abi.encodePacked(emailHash, openIDHash));
    }
}
