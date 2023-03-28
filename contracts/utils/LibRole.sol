// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.15;

library LibRole {
    uint32 public constant OWNER_THRESHOLD = 100;
    uint32 public constant OWNER_CANCEL_TIMELOCK_THRESHOLD = 1;
    uint32 public constant GUARDIAN_THRESHOLD = 100;
    uint32 public constant GUARDIAN_TIMELOCK_THRESHOLD = 50;
    uint32 public constant SYNC_TX_THRESHOLD = 0;
    uint32 public constant ASSETS_OP_THRESHOLD = 100;
}
