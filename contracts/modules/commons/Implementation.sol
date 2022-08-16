// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "../../interfaces/IModuleWhiteList.sol";

/**
 * @dev Allows modules to access the implementation slot
 */
abstract contract Implementation {
    error IsImplementationWhiteListRevert(bytes reason);

    function _requireImplementationWhiteList(address _addr) internal view virtual;

    /**
     * @notice Updates the Wallet implementation
     * @param _imp New implementation address
     * @dev The wallet implementation is stored on the storage slot
     *   defined by the address of the wallet itself
     *   WARNING updating this value may break the wallet and users
     *   must be confident that the new implementation is safe.
     */
    function _setImplementation(address _imp) internal {
        _requireImplementationWhiteList(_imp);

        assembly {
            sstore(address(), _imp)
        }
    }

    /**
     * @notice Returns the Wallet implementation
     * @return _imp The address of the current Wallet implementation
     */
    function getImplementation() public view returns (address _imp) {
        assembly {
            _imp := sload(address())
        }
    }
}
