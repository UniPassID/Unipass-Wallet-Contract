//SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import "hardhat/console.sol";

contract Greeter {
    address public greeting;
    bytes32 public no;
    bytes32[] public inner;

    function init(address _greeting, bytes32 _no) public {
        greeting = _greeting;
        no = _no;
    }

    function ret1() public pure returns (uint256) {
        return 1;
    }
}
