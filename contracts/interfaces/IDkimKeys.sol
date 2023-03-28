// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.15;

import "../modules/utils/LibEmailHash.sol";
import "../interfaces/IModuleAccount.sol";

interface IDkimKeys {
    enum EmailType {
        None,
        UpdateKeysetHash,
        LockKeysetHash,
        CancelLockKeysetHash,
        UpdateTimeLockDuring,
        UpdateImplementation,
        SyncAccount,
        CallOtherContract
    }

    function getDKIMKey(bytes calldata _emailServer) external view returns (bytes memory);

    function dkimVerify(uint256 _index, bytes calldata _data)
        external
        view
        returns (
            bool ret,
            EmailType emailType,
            bytes32 emailHash,
            bytes32 subjectHash,
            uint256 index
        );
}
