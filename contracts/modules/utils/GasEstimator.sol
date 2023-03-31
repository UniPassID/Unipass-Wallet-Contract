// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import "hardhat/console.sol";

contract GasEstimator {
    function estimate(address _to, bytes calldata _data)
        external
        returns (
            bool success,
            bytes memory result,
            uint256 gas
        )
    {
        uint256 initialGas = gasleft();
        (success, result) = _to.call(_data);
        gas = initialGas - gasleft();
    }
}
