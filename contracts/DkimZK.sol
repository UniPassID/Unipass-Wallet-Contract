// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "./interfaces/IDkimZK.sol";
import "./utils/LibBytes.sol";
import "UniPass-verifier-contract/contracts/UnipassVerifier.sol";

import "hardhat/console.sol";

contract DkimZK is UnipassVerifier, IDkimZK {
    using LibBytes for bytes;

    constructor(address _admin) UnipassVerifier(_admin) {}

    /**
     *  @dev DkimZK Params serialize to bytes in the _data.
     *          _data[_index:]:
     *              publicInputsLen(u32) publicInputs(uint256[])
     *              vkdataLen(u32) vkdata(uint256[])
     *              serializedProofLen(u32) serializeProof(uint256[])
     */
    function getEmailHashByZK(
        uint32 _fromLeftIndex,
        uint32 _fromLen,
        uint256 _index,
        bytes calldata _headerPubMatch,
        bytes calldata _data
    )
        external
        view
        returns (
            bytes32 emailHash,
            bytes32 emailHeaderHash,
            uint256 index
        )
    {
        uint128 domainSize = uint128(bytes16(_data[_index:_index + 16]));
        index = _index + 16;

        uint256[] memory publicInput;
        (publicInput, index) = _data.mcReadUint256Array(index);

        uint256[] memory vkdata;
        (vkdata, index) = _data.mcReadUint256Array(index);

        uint256[] memory proof;
        (proof, index) = _data.mcReadUint256Array(index);

        if (_headerPubMatch.length > 1024) {
            require(verifyV2048(domainSize, vkdata, publicInput, proof), "getEmailHashByZK: INVALID_ZK");
            bytes32 headerPubMatchHash;
            (emailHeaderHash, emailHash, headerPubMatchHash) = checkPublicInputs2048(_fromLeftIndex, _fromLen, publicInput);
            require(sha256(_headerPubMatch) == headerPubMatchHash, "getEmailHashByZK: INVALID_HEADER_MATCH");
        } else {
            require(verifyV1024(domainSize, vkdata, publicInput, proof), "getEmailHashByZK: INVALID_ZK");
            bytes32 headerPubMatchHash;
            (emailHeaderHash, emailHash, headerPubMatchHash) = checkPublicInputs1024(_fromLeftIndex, _fromLen, publicInput);
            require(sha256(_headerPubMatch) == headerPubMatchHash, "getEmailHashByZK: INVALID_HEADER_MATCH");
        }
    }
}
