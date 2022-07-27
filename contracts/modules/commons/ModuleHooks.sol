// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "./ModuleStorage.sol";
import "./ModuleERC165.sol";

import "../../interfaces/IERC1155Receiver.sol";
import "../../interfaces/IERC721Receiver.sol";
import "../../interfaces/IERC223Receiver.sol";
import "../../interfaces/IModuleHooks.sol";
import "../../utils/LibBytes.sol";

import "hardhat/console.sol";

contract ModuleHooks is
    IERC1155Receiver,
    IERC721Receiver,
    IModuleHooks,
    ModuleERC165
{
    enum HookActionType {
        AddHook,
        RemoveHook
    }
    using LibBytes for bytes;
    //                       HOOKS_KEY = keccak256("org.arcadeum.module.hooks.hooks");
    bytes32 private constant HOOKS_KEY =
        bytes32(
            0xbe27a319efc8734e89e26ba4bc95f5c788584163b959f03fa04e2d7ab4b9a120
        );

    error invalidHookActionType(HookActionType);

    /**
     * @notice Reads the implementation hook of a signature
     * @param _signature Signature function
     * @return The address of the implementation hook, address(0) if none
     */
    function readHook(bytes4 _signature)
        external
        view
        virtual
        returns (address)
    {
        return _readHook(_signature);
    }

    function _executeHooksTx(bytes calldata _input) internal override {
        uint256 index;
        uint8 _actionType;
        (_actionType, index) = _input.cReadFirstUint8();
        HookActionType actionType = HookActionType(_actionType);
        if (actionType == HookActionType.AddHook) {
            bytes4 signature;
            (signature, index) = _input.cReadBytes4(index);
            address implementation;
            (implementation, index) = _input.readAddress(index);
            _addHook(bytes4(signature), implementation);
        } else if (actionType == HookActionType.RemoveHook) {
            bytes4 signature;
            (signature, index) = _input.cReadBytes4(index);
            _removeHook(bytes4(signature));
        } else {
            revert invalidHookActionType(actionType);
        }
    }

    /**
     * @notice Adds a new hook to handle a given function selector
     * @param _signature Signature function linked to the hook
     * @param _implementation Hook implementation contract
     * @dev Can't overwrite hooks that are part of the mainmodule (those defined below)
     */
    function _addHook(bytes4 _signature, address _implementation)
        internal
        virtual
    {
        if (_readHook(_signature) != address(0))
            revert HookAlreadyExists(_signature);
        _writeHook(_signature, _implementation);
    }

    /**
     * @notice Removes a registered hook
     * @param _signature Signature function linked to the hook
     * @dev Can't remove hooks that are part of the mainmodule (those defined below)
     *      without upgrading the wallet
     */
    function _removeHook(bytes4 _signature) internal virtual {
        if (_readHook(_signature) == address(0))
            revert HookDoesNotExist(_signature);
        _writeHook(_signature, address(0));
    }

    /**
     * @notice Reads the implementation hook of a signature
     * @param _signature Signature function
     * @return The address of the implementation hook, address(0) if none
     */
    function _readHook(bytes4 _signature) private view returns (address) {
        return
            address(
                uint160(
                    uint256(ModuleStorage.readBytes32Map(HOOKS_KEY, _signature))
                )
            );
    }

    /**
     * @notice Writes the implementation hook of a signature
     * @param _signature Signature function
     * @param _implementation Hook implementation contract
     */
    function _writeHook(bytes4 _signature, address _implementation) private {
        ModuleStorage.writeBytes32Map(
            HOOKS_KEY,
            _signature,
            bytes32(uint256(uint160(_implementation)))
        );
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
    ) external virtual override returns (bytes4) {
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
    ) external virtual override returns (bytes4) {
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
    ) external virtual override returns (bytes4) {
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
    function supportsInterface(bytes4 _interfaceID)
        public
        pure
        virtual
        override
        returns (bool)
    {
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
