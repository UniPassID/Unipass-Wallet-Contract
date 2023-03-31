// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract FeeEstimator {
    function estimate(
        address _token,
        address _feeReceiver,
        address _to,
        bytes calldata _data
    )
        external
        returns (
            bool success,
            bytes memory result,
            uint256 gas,
            uint256 feeAmount
        )
    {
        uint256 startAmount = 0;
        if (_token == address(0)) {
            startAmount = _feeReceiver.balance;
        } else {
            startAmount = IERC20(_token).balanceOf(_feeReceiver);
        }

        uint256 initialGas = gasleft();
        (success, result) = _to.call(_data);
        gas = initialGas - gasleft();

        if (_token == address(0)) {
            feeAmount = _feeReceiver.balance - startAmount;
        } else {
            feeAmount = IERC20(_token).balanceOf(_feeReceiver) - startAmount;
        }
    }
}
