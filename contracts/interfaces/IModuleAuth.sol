// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

abstract contract IModuleAuth {
    enum SigType {
        SigMasterKey,
        SigRecoveryEmail,
        SigMasterKeyWithRecoveryEmail,
        SigSessionKey,
        SigNone
    }

    function executeAccountTx(bytes calldata _input) public virtual;

    function isValidSignature(
        SigType _sigType,
        bytes32 _hash,
        bytes calldata _signature,
        uint256 _index
    ) public virtual returns (bool);
}
