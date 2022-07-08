// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

enum SigType {
    SigMasterKey,
    SigRecoveryEmail,
    SigMasterKeyWithRecoveryEmail,
    SigSessionKey,
    SigNone
}
