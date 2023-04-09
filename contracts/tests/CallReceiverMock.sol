// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

contract CallReceiverMock {
    uint256 public lastValA;
    bytes public lastValB;

    bool public revertFlag;

    constructor() payable {}

    function setRevertFlag(bool _revertFlag) external {
        revertFlag = _revertFlag;
    }

    function testCall(uint256 _valA, bytes calldata _valB) external payable {
        require(!revertFlag, "testCall: REVERT_FLAG");

        lastValA = _valA;
        lastValB = _valB;
    }
}
