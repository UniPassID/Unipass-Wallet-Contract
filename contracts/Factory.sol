// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;
import "./Wallet.sol";
import "./interfaces/IDkimKeys.sol";
import "hardhat/console.sol";

contract Factory {
    event FactoryDeploy(address);

    /**
     * @notice Will deploy a new wallet instance
     * @param _mainModule Address of the main module to be used by the wallet
     * @param _keysetHash Salt used to generate the wallet, which is the keysetHash of the
     *      account.
     */
    function deploy(
        address _mainModule,
        bytes32 _keysetHash,
        address _dkimKeys
    ) public payable returns (address _contract) {
        bytes memory code = abi.encodePacked(
            Wallet.creationCode,
            uint256(uint160(_mainModule))
        );
        bytes32 salt = keccak256(abi.encodePacked(_keysetHash, _dkimKeys));
        assembly {
            _contract := create2(callvalue(), add(code, 32), mload(code), salt)
        }
        if (_contract != address(0)) {
            (bool success, bytes memory _result) = _contract.call(
                abi.encodeWithSignature(
                    "init(address,bytes32)",
                    _dkimKeys,
                    _keysetHash
                )
            );
            if (success) {
                emit FactoryDeploy(_contract);
            } else {
                revert("Factory#deploy: INIT_FALIED");
            }
        } else {
            revert("Factory#deploy: INIT_FALIED");
        }
    }
}
