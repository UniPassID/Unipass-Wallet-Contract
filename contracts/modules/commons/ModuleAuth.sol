// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import "./ModuleStorage.sol";
import "./ModuleAuthBase.sol";
import "../utils/LibUnipassSig.sol";
import "../../utils/LibSignatureValidator.sol";
import "../../utils/LibRole.sol";
import "../../interfaces/IDkimKeys.sol";

import "@openzeppelin/contracts/interfaces/IERC1271.sol";

import "hardhat/console.sol";

abstract contract ModuleAuth is ModuleAuthBase, IERC1271 {
    using LibBytes for bytes;

    IDkimKeys public immutable dkimKeys;
    IOpenID public immutable openID;

    constructor(IDkimKeys _dkimKeys, IOpenID _openID) {
        require(address(_dkimKeys) != address(0), "INVALID_DKIMKEYS");
        dkimKeys = _dkimKeys;
        require(address(_openID) != address(0), "INVALID_DKIMKEYS");
        openID = _openID;
    }

    //                       KEYSET_HASH_KEY = keccak256("unipass-wallet:module-auth:keyset-hash")
    bytes32 private constant KEYSET_HASH_KEY = bytes32(0x8771a5ac72b51506266988b53b9d8e36c46e1edb814d37bf2337d2f69e4ac9bc);

    uint256 private immutable ZERO_CHAINID = 0;

    function _writeKeysetHash(bytes32 _keysetHash) internal {
        ModuleStorage.writeBytes32(KEYSET_HASH_KEY, _keysetHash);
    }

    function getKeysetHash() public view returns (bytes32 keysetHash) {
        keysetHash = ModuleStorage.readBytes32(KEYSET_HASH_KEY);
    }

    /**
     * @param _hash The Hash To Valdiate Signature
     * @param _signature The Transaction Signature
     * @return succ Whether The Signature is Valid
     * @return emailType The Email Type From Key Email Address
     * @return ownerWeight The Threshold Weight of Role Owner
     * @return assetsOpWeight The Threshold Weight Of Role AssetsOp
     * @return guardianWeight The Threshold Weight Of Role Guardian
     */
    function validateSignature(bytes32 _hash, bytes calldata _signature)
        public
        view
        virtual
        override
        returns (
            bool succ,
            IDkimKeys.EmailType emailType,
            uint32 ownerWeight,
            uint32 assetsOpWeight,
            uint32 guardianWeight
        )
    {
        if (_signature.length == 0) {
            return (true, IDkimKeys.EmailType.None, 0, 0, 0);
        }
        uint256 index;
        bool isSessionKey = _signature.mcReadUint8(index) == 1;
        ++index;

        if (isSessionKey) {
            bytes32 digestHash;
            {
                uint32 timestamp;
                (timestamp, index) = _signature.cReadUint32(index);
                require(block.timestamp < timestamp, "_validateSignature: INVALID_TIMESTAMP");
                (assetsOpWeight, index) = _signature.cReadUint32(index);
                address sessionKey = LibSignatureValidator.recoverSigner(_hash, _signature[index:index + 66]);
                index += 66;
                // For using session key in multiple chains, Not hash chainId.
                digestHash = LibUnipassSig._subDigest(
                    keccak256(abi.encodePacked(sessionKey, timestamp, assetsOpWeight)),
                    ZERO_CHAINID
                );
            }
            bool success;
            uint96 weights;
            (success, emailType, weights) = _validateSignatureInner(digestHash, index, _signature);
            succ = success && (weights << 32) >> 64 >= assetsOpWeight;
        } else {
            uint96 weights;
            (succ, emailType, weights) = _validateSignatureInner(_hash, index, _signature);
            ownerWeight = uint32(weights >> 64);
            assetsOpWeight = uint32((weights << 32) >> 64);
            guardianWeight = uint32((weights << 64) >> 64);
        }
    }

    function _parseKey(
        bytes32 _hash,
        bytes calldata _signature,
        uint256 _index
    )
        internal
        view
        returns (
            bool isSig,
            IDkimKeys.EmailType emailType,
            LibUnipassSig.KeyType keyType,
            bytes32 ret,
            uint256 index
        )
    {
        (isSig, emailType, keyType, ret, index) = LibUnipassSig._parseKey(dkimKeys, openID, _hash, _signature, _index);
    }

    function _validateSignatureInner(
        bytes32 _hash,
        uint256 _index,
        bytes calldata _signature
    )
        internal
        view
        returns (
            bool succ,
            IDkimKeys.EmailType emailType,
            uint96 weights
        )
    {
        bytes32 keysetHash;
        IDkimKeys.EmailType tmpEmailType;
        while (_index < _signature.length - 1) {
            bool isSig;
            LibUnipassSig.KeyType keyType;
            bytes32 ret;
            (isSig, emailType, keyType, ret, _index) = _parseKey(_hash, _signature, _index);
            if (emailType == IDkimKeys.EmailType.None && tmpEmailType != IDkimKeys.EmailType.None) {
                emailType = tmpEmailType;
            } else if (emailType != IDkimKeys.EmailType.None) {
                if (tmpEmailType != IDkimKeys.EmailType.None) {
                    require(emailType == tmpEmailType, "_validateSignatureInner: INVALID_EMAILTYPE");
                } else {
                    tmpEmailType = emailType;
                }
            }
            uint96 singleWeights = uint96(bytes12(_signature.mcReadBytesN(_index, 12)));
            _index += 12;
            if (isSig) {
                weights += singleWeights;
            }
            if (keyType == LibUnipassSig.KeyType.Secp256k1 || keyType == LibUnipassSig.KeyType.ERC1271Wallet) {
                keysetHash = keysetHash == bytes32(0)
                    ? keccak256(abi.encodePacked(keyType, address(uint160(uint256(ret))), singleWeights))
                    : keccak256(abi.encodePacked(keysetHash, keyType, address(uint160(uint256(ret))), singleWeights));
            } else {
                keysetHash = keysetHash == bytes32(0)
                    ? keccak256(abi.encodePacked(keyType, ret, singleWeights))
                    : keccak256(abi.encodePacked(keysetHash, keyType, ret, singleWeights));
            }
        }

        succ = isValidKeysetHash(keysetHash);
    }

    function _parseRoleWeight(uint256 _index, bytes calldata _signature)
        private
        pure
        returns (
            uint32 ownerWeight,
            uint32 assetsOpWeight,
            uint32 guardianWeight,
            uint256 index
        )
    {
        (ownerWeight, index) = _signature.cReadUint32(_index);
        (assetsOpWeight, index) = _signature.cReadUint32(index);
        (guardianWeight, index) = _signature.cReadUint32(index);
    }

    /**
     * @dev Should return whether the signature provided is valid for the provided data
     * @param _hash      Hash of the data to be signed
     * @param _signature Signature byte array associated with _data
     */
    function isValidSignature(bytes32 _hash, bytes calldata _signature) external view override returns (bytes4 magicValue) {
        // Validate signatures
        (bool isValid, IDkimKeys.EmailType emailType, , uint32 assetsOpWeight, ) = validateSignature(_hash, _signature);
        if (
            isValid &&
            (emailType == IDkimKeys.EmailType.None || emailType == IDkimKeys.EmailType.CallOtherContract) &&
            assetsOpWeight >= LibRole.ASSETS_OP_THRESHOLD
        ) {
            magicValue = LibUnipassSig.SELECTOR_ERC1271_BYTES32_BYTES;
        }
    }
}
