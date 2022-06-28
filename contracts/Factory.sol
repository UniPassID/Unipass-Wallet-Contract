// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;
import "./Wallet.sol";
import "hardhat/console.sol";

contract Factory {
    event FactoryDeploy(address);

    /**
     * @notice Will deploy a new wallet instance
     * @param _mainModule Address of the main module to be used by the wallet
     * @param _salt Salt used to generate the wallet, which is the keySet of the
     *      account.
     */
    function deploy(
        address _mainModule,
        bytes32 _salt,
        address _masterKey,
        uint256 _threshold,
        bytes32[] memory _recoveryEmails
    ) public payable returns (address _contract) {
        require(
            _salt ==
                sha256(
                    abi.encodePacked(_masterKey, _threshold, _recoveryEmails)
                ),
            "Factory#deploy: INVALID_KEYSET"
        );
        bytes memory code = abi.encodePacked(
            Wallet.creationCode,
            uint256(uint160(_mainModule))
        );
        assembly {
            _contract := create2(callvalue(), add(code, 32), mload(code), _salt)
        }
        if (_contract != address(0)) {
            (bool success, bytes memory _result) = _contract.call(
                abi.encodeWithSignature(
                    "init(address,uint256,bytes32[])",
                    _masterKey,
                    _threshold,
                    _recoveryEmails
                )
            );
            if (success) {
                emit FactoryDeploy(_contract);
            } else {
                revert("Factory#deploy: INIT_FALIED");
            }
        }
    }
}
