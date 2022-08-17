// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

/* solhint-disable no-complex-fallback */

import "./ModuleStorage.sol";
import "./ModuleERC165.sol";
import "./ModuleSelfAuth.sol";

import "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "../../interfaces/IERC223Receiver.sol";
import "../../interfaces/IModuleHooks.sol";
import "../../interfaces/IModuleWhiteList.sol";
import "../../utils/LibBytes.sol";

import "hardhat/console.sol";

abstract contract ModuleHooks is ModuleSelfAuth, IERC1155Receiver, IERC721Receiver, IModuleHooks, ModuleERC165 {
    using LibBytes for bytes;
    //                       HOOKS_KEY = keccak256("org.arcadeum.module.hooks.hooks");
    bytes32 private constant HOOKS_KEY = bytes32(0xbe27a319efc8734e89e26ba4bc95f5c788584163b959f03fa04e2d7ab4b9a120);

    error IsHooksWhiteListRevert(bytes reason);

    event AddHook(bytes4 _signature, address _hook);
    event RemoveHook(bytes4 _signature);

    function _requireHookWhiteList(address _addr) internal view virtual;

    /**
     * @notice Reads the implementation hook of a signature
     * @param _signature Signature function
     * @return The address of the implementation hook, address(0) if none
     */
    function readHook(bytes4 _signature) external view override returns (address) {
        return _readHook(_signature);
    }

    /**
     * @notice Adds a new hook to handle a given function selector
     * @param _signature Signature function linked to the hook
     * @param _hook Hook implementation contract
     * @dev Can't overwrite hooks that are part of the mainmodule (those defined below)
     */
    function addHook(bytes4 _signature, address _hook) external override onlySelf {
        if (_readHook(_signature) != address(0)) revert HookAlreadyExists(_signature);
        _writeHook(_signature, _hook);
        emit AddHook(_signature, _hook);
    }

    /**
     * @notice Removes a registered hook
     * @param _signature Signature function linked to the hook
     * @dev Can't remove hooks that are part of the mainmodule (those defined below)
     *      without upgrading the wallet
     */
    function removeHook(bytes4 _signature) external override onlySelf {
        if (_readHook(_signature) == address(0)) revert HookDoesNotExist(_signature);
        _writeHook(_signature, address(0));
        emit RemoveHook(_signature);
    }

    /**
     * @notice Reads the implementation hook of a signature
     * @param _signature Signature function
     * @return The address of the implementation hook, address(0) if none
     */
    function _readHook(bytes4 _signature) private view returns (address) {
        return address(uint160(uint256(ModuleStorage.readBytes32Map(HOOKS_KEY, _signature))));
    }

    /**
     * @notice Writes the implementation hook of a signature
     * @param _signature Signature function
     * @param _implementation Hook implementation contract
     */
    function _writeHook(bytes4 _signature, address _implementation) private {
        if (_implementation != address(0)) _requireHookWhiteList(_implementation);
        ModuleStorage.writeBytes32Map(HOOKS_KEY, _signature, bytes32(uint256(uint160(_implementation))));
    }

    /**
     * @notice Handle the receipt of a single ERC1155 token type.
     * @return `bytes4(keccak256("onERC1155Received(address,address,uint256,uint256,bytes)"))`
     */
    function onERC1155Received(
        address,
        address,
        uint256,
        uint256,
        bytes calldata
    ) external pure virtual override returns (bytes4) {
        return ModuleHooks.onERC1155Received.selector;
    }

    /**
     * @notice Handle the receipt of multiple ERC1155 token types.
     * @return `bytes4(keccak256("onERC1155BatchReceived(address,address,uint256[],uint256[],bytes)"))`
     */
    function onERC1155BatchReceived(
        address,
        address,
        uint256[] calldata,
        uint256[] calldata,
        bytes calldata
    ) external pure virtual override returns (bytes4) {
        return ModuleHooks.onERC1155BatchReceived.selector;
    }

    /**
     * @notice Handle the receipt of a single ERC721 token.
     * @return `bytes4(keccak256("onERC721Received(address,address,uint256,bytes)"))`
     */
    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure virtual override returns (bytes4) {
        return ModuleHooks.onERC721Received.selector;
    }

    /**
     * @notice Routes fallback calls through hooks
     */
    fallback() external payable {
        address target = _readHook(msg.sig);
        if (target != address(0)) {
            (bool success, bytes memory result) = target.delegatecall(msg.data);
            assembly {
                if iszero(success) {
                    revert(add(result, 0x20), mload(result))
                }

                return(add(result, 0x20), mload(result))
            }
        }
    }

    /**
     * @notice Allows the wallet to receive ETH
     */
    receive() external payable {}

    /**
     * @notice Query if a contract implements an interface
     * @param _interfaceID The interface identifier, as specified in ERC-165
     * @return `true` if the contract implements `_interfaceID`
     */
    function supportsInterface(bytes4 _interfaceID) public pure virtual override(ModuleERC165, IERC165) returns (bool) {
        if (
            _interfaceID == type(IModuleHooks).interfaceId ||
            _interfaceID == type(IERC1155Receiver).interfaceId ||
            _interfaceID == type(IERC721Receiver).interfaceId ||
            _interfaceID == type(IERC223Receiver).interfaceId
        ) {
            return true;
        }

        return super.supportsInterface(_interfaceID);
    }
}
