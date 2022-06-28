//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";

contract Greeter {
    address public greeting;
    uint256 public no;
    bytes32[] public inner;

    function init(
        address _greeting,
        uint256 _no,
        bytes32[] memory _inner
    ) public {
        greeting = _greeting;
        no = _no;
        inner = _inner;
    }
}
