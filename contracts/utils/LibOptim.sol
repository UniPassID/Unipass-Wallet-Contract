// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.14;

library LibOptim {
    function returnData() internal pure returns (bytes memory r) {
        assembly {
            let size := returndatasize()
            r := mload(0x40)
            let start := add(r, 32)
            mstore(0x40, add(start, size))
            mstore(r, size)
            returndatacopy(start, 0, size)
        }
    }

    function call(
        address _to,
        uint256 _val,
        uint256 _gas,
        bytes calldata _data
    ) internal returns (bool r) {
        assembly {
            let tmp := mload(0x40)
            calldatacopy(tmp, _data.offset, _data.length)

            r := call(_gas, _to, _val, tmp, _data.length, 0, 0)
        }
    }

    function delegatecall(
        address _to,
        uint256 _gas,
        bytes calldata _data
    ) internal returns (bool r) {
        assembly {
            let tmp := mload(0x40)
            calldatacopy(tmp, _data.offset, _data.length)

            r := delegatecall(_gas, _to, tmp, _data.length, 0, 0)
        }
    }
}
