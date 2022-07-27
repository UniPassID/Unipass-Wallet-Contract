// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;
import "./Wallet.sol";
import "./interfaces/IDkimKeys.sol";
import "hardhat/console.sol";

contract Factory {
    /**
     * @notice Will deploy a new wallet instance
     * @param _mainModule Address of the main module to be used by the wallet
     * @param _salt Salt used to generate the wallet, which is the keysetHash of the
     *      account.
     */
    function deploy(address _mainModule, bytes32 _salt)
        public
        payable
        returns (address _contract)
    {
        bytes memory code = abi.encodePacked(
            Wallet.CREATION_CODE,
            uint256(uint160(_mainModule))
        );
        assembly {
            _contract := create2(callvalue(), add(code, 32), mload(code), _salt)
        }
    }
}
