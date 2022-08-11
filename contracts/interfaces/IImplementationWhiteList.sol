// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

interface IImplementationWhiteList {
    function getImplementation(address implementation) external view returns (bool);
}
