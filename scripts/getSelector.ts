import { Interface } from "ethers/lib/utils";

const abi = `[
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_factory",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "_moduleMainUpgradable",
        "type": "address"
      },
      {
        "internalType": "contract IDkimKeys",
        "name": "_dkimKeys",
        "type": "address"
      },
      {
        "internalType": "contract IModuleWhiteList",
        "name": "_whiteList",
        "type": "address"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [
      {
        "internalType": "bytes4",
        "name": "_permission",
        "type": "bytes4"
      }
    ],
    "name": "ConstantPermission",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "bytes",
        "name": "reason",
        "type": "bytes"
      }
    ],
    "name": "DkimFailed",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "bytes4",
        "name": "_signature",
        "type": "bytes4"
      }
    ],
    "name": "HookAlreadyExists",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "bytes4",
        "name": "_signature",
        "type": "bytes4"
      }
    ],
    "name": "HookDoesNotExist",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "bytes4",
        "name": "_selector",
        "type": "bytes4"
      }
    ],
    "name": "ImmutableSelectorSigWeight",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_actionType",
        "type": "uint256"
      }
    ],
    "name": "InvalidActionType",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "enum ModuleTransaction.CallType",
        "name": "",
        "type": "uint8"
      }
    ],
    "name": "InvalidCallType",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_implementation",
        "type": "address"
      }
    ],
    "name": "InvalidImplementation",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "enum LibUnipassSig.KeyType",
        "name": "_keyType",
        "type": "uint8"
      }
    ],
    "name": "InvalidKeyType",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "bytes",
        "name": "_signature",
        "type": "bytes"
      },
      {
        "internalType": "bytes32",
        "name": "_s",
        "type": "bytes32"
      }
    ],
    "name": "InvalidSValue",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "bytes",
        "name": "_signature",
        "type": "bytes"
      }
    ],
    "name": "InvalidSignatureLength",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "bytes",
        "name": "_signature",
        "type": "bytes"
      },
      {
        "internalType": "uint256",
        "name": "_v",
        "type": "uint256"
      }
    ],
    "name": "InvalidVValue",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "bytes",
        "name": "reason",
        "type": "bytes"
      }
    ],
    "name": "IsHooksWhiteListRevert",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "bytes",
        "name": "reason",
        "type": "bytes"
      }
    ],
    "name": "IsImplementationWhiteListRevert",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_requested",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "_available",
        "type": "uint256"
      }
    ],
    "name": "NotEnoughGas",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "bytes4",
        "name": "_selector",
        "type": "bytes4"
      }
    ],
    "name": "SelectorDoesNotExist",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "bytes",
        "name": "_signature",
        "type": "bytes"
      }
    ],
    "name": "SignerIsAddress0",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "_txHash",
        "type": "bytes32"
      },
      {
        "internalType": "bytes",
        "name": "_reason",
        "type": "bytes"
      }
    ],
    "name": "TxFailed",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "bytes4",
        "name": "_selector",
        "type": "bytes4"
      }
    ],
    "name": "UnknownCallDataSelector",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "bytes",
        "name": "_signature",
        "type": "bytes"
      },
      {
        "internalType": "uint256",
        "name": "_type",
        "type": "uint256"
      },
      {
        "internalType": "bool",
        "name": "_recoverMode",
        "type": "bool"
      }
    ],
    "name": "UnsupportedSignatureType",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "bytes4",
        "name": "_signature",
        "type": "bytes4"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "_hook",
        "type": "address"
      }
    ],
    "name": "AddHook",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "bytes4",
        "name": "_permission",
        "type": "bytes4"
      },
      {
        "indexed": false,
        "internalType": "uint32",
        "name": "_ownerWeight",
        "type": "uint32"
      },
      {
        "indexed": false,
        "internalType": "uint32",
        "name": "_assetsOpWeight",
        "type": "uint32"
      },
      {
        "indexed": false,
        "internalType": "uint32",
        "name": "_guardianWeight",
        "type": "uint32"
      }
    ],
    "name": "AddPermission",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "_metaNonce",
        "type": "uint256"
      }
    ],
    "name": "CancelLockKeysetHash",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "bytes4",
        "name": "_signature",
        "type": "bytes4"
      }
    ],
    "name": "RemoveHook",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "bytes4",
        "name": "_permission",
        "type": "bytes4"
      }
    ],
    "name": "RemovePermission",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "_source",
        "type": "bytes32"
      }
    ],
    "name": "SetSource",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "_metaNonce",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "_newKeysetHash",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "uint32",
        "name": "_newTimeLockDuring",
        "type": "uint32"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "newImplementation",
        "type": "address"
      }
    ],
    "name": "SyncAccount",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "_txHash",
        "type": "bytes32"
      }
    ],
    "name": "TxExecuted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "_txHash",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "bytes",
        "name": "_reason",
        "type": "bytes"
      }
    ],
    "name": "TxFailedEvent",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "_txHash",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "bytes",
        "name": "_reason",
        "type": "bytes"
      }
    ],
    "name": "TxPayFeeFailed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "_metaNonce",
        "type": "uint256"
      }
    ],
    "name": "UnlockKeysetHash",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "_metaNonce",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "_newImplementation",
        "type": "address"
      }
    ],
    "name": "UpdateImplementation",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "_metaNonce",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "newKeysetHash",
        "type": "bytes32"
      }
    ],
    "name": "UpdateKeysetHash",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "_metaNonce",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "newKeysetHash",
        "type": "bytes32"
      }
    ],
    "name": "UpdateKeysetHashWithTimeLock",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "_metaNonce",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint32",
        "name": "_newTimeLockDuring",
        "type": "uint32"
      }
    ],
    "name": "UpdateTimeLockDuring",
    "type": "event"
  },
  {
    "stateMutability": "payable",
    "type": "fallback"
  },
  {
    "inputs": [],
    "name": "FACTORY",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "INIT_CODE_HASH",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "MODULE_MAIN_UPGRADABLE",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes4",
        "name": "_signature",
        "type": "bytes4"
      },
      {
        "internalType": "address",
        "name": "_hook",
        "type": "address"
      }
    ],
    "name": "addHook",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes4",
        "name": "_permission",
        "type": "bytes4"
      },
      {
        "internalType": "uint32",
        "name": "_ownerWeight",
        "type": "uint32"
      },
      {
        "internalType": "uint32",
        "name": "_assetsOpWeight",
        "type": "uint32"
      },
      {
        "internalType": "uint32",
        "name": "_guardianWeight",
        "type": "uint32"
      }
    ],
    "name": "addPermission",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint32",
        "name": "_metaNonce",
        "type": "uint32"
      },
      {
        "internalType": "bytes",
        "name": "_signature",
        "type": "bytes"
      }
    ],
    "name": "cancelLockKeysetHash",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "dkimKeys",
    "outputs": [
      {
        "internalType": "contract IDkimKeys",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "components": [
          {
            "internalType": "enum ModuleTransaction.CallType",
            "name": "callType",
            "type": "uint8"
          },
          {
            "internalType": "bool",
            "name": "revertOnError",
            "type": "bool"
          },
          {
            "internalType": "address",
            "name": "target",
            "type": "address"
          },
          {
            "internalType": "uint256",
            "name": "gasLimit",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "value",
            "type": "uint256"
          },
          {
            "internalType": "bytes",
            "name": "data",
            "type": "bytes"
          }
        ],
        "internalType": "struct ModuleTransaction.Transaction[]",
        "name": "_txs",
        "type": "tuple[]"
      },
      {
        "internalType": "uint256",
        "name": "_nonce",
        "type": "uint256"
      },
      {
        "internalType": "bytes",
        "name": "_signature",
        "type": "bytes"
      }
    ],
    "name": "execute",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getImplementation",
    "outputs": [
      {
        "internalType": "address",
        "name": "_imp",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getKeysetHash",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "keysetHash",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getLockInfo",
    "outputs": [
      {
        "internalType": "bool",
        "name": "isLockedRet",
        "type": "bool"
      },
      {
        "internalType": "uint32",
        "name": "lockDuringRet",
        "type": "uint32"
      },
      {
        "internalType": "bytes32",
        "name": "lockedKeysetHashRet",
        "type": "bytes32"
      },
      {
        "internalType": "uint256",
        "name": "unlockAfterRet",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getMetaNonce",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getNonce",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes4",
        "name": "_permission",
        "type": "bytes4"
      }
    ],
    "name": "getRoleOfPermission",
    "outputs": [
      {
        "internalType": "uint32",
        "name": "ownerWeight",
        "type": "uint32"
      },
      {
        "internalType": "uint32",
        "name": "assetsOpWeight",
        "type": "uint32"
      },
      {
        "internalType": "uint32",
        "name": "guardianWeight",
        "type": "uint32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getSource",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "source",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes",
        "name": "_callData",
        "type": "bytes"
      },
      {
        "internalType": "bytes32",
        "name": "_digestHash",
        "type": "bytes32"
      },
      {
        "internalType": "bytes",
        "name": "_signature",
        "type": "bytes"
      }
    ],
    "name": "isValidCallData",
    "outputs": [
      {
        "internalType": "bool",
        "name": "success",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "_keysetHash",
        "type": "bytes32"
      }
    ],
    "name": "isValidKeysetHash",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "_hash",
        "type": "bytes32"
      },
      {
        "internalType": "bytes",
        "name": "_signature",
        "type": "bytes"
      }
    ],
    "name": "isValidSignature",
    "outputs": [
      {
        "internalType": "bytes4",
        "name": "magicValue",
        "type": "bytes4"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      },
      {
        "internalType": "uint256[]",
        "name": "",
        "type": "uint256[]"
      },
      {
        "internalType": "uint256[]",
        "name": "",
        "type": "uint256[]"
      },
      {
        "internalType": "bytes",
        "name": "",
        "type": "bytes"
      }
    ],
    "name": "onERC1155BatchReceived",
    "outputs": [
      {
        "internalType": "bytes4",
        "name": "",
        "type": "bytes4"
      }
    ],
    "stateMutability": "pure",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      },
      {
        "internalType": "bytes",
        "name": "",
        "type": "bytes"
      }
    ],
    "name": "onERC1155Received",
    "outputs": [
      {
        "internalType": "bytes4",
        "name": "",
        "type": "bytes4"
      }
    ],
    "stateMutability": "pure",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      },
      {
        "internalType": "bytes",
        "name": "",
        "type": "bytes"
      }
    ],
    "name": "onERC721Received",
    "outputs": [
      {
        "internalType": "bytes4",
        "name": "",
        "type": "bytes4"
      }
    ],
    "stateMutability": "pure",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes4",
        "name": "",
        "type": "bytes4"
      }
    ],
    "name": "permissions",
    "outputs": [
      {
        "internalType": "bytes12",
        "name": "",
        "type": "bytes12"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes4",
        "name": "_signature",
        "type": "bytes4"
      }
    ],
    "name": "readHook",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes4",
        "name": "_signature",
        "type": "bytes4"
      }
    ],
    "name": "removeHook",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes4",
        "name": "_permission",
        "type": "bytes4"
      }
    ],
    "name": "removePermission",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint32",
        "name": "_ownerWeight",
        "type": "uint32"
      },
      {
        "internalType": "uint32",
        "name": "_assetsOpWeight",
        "type": "uint32"
      },
      {
        "internalType": "uint32",
        "name": "_guardianWeight",
        "type": "uint32"
      },
      {
        "components": [
          {
            "internalType": "enum ModuleTransaction.CallType",
            "name": "callType",
            "type": "uint8"
          },
          {
            "internalType": "bool",
            "name": "revertOnError",
            "type": "bool"
          },
          {
            "internalType": "address",
            "name": "target",
            "type": "address"
          },
          {
            "internalType": "uint256",
            "name": "gasLimit",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "value",
            "type": "uint256"
          },
          {
            "internalType": "bytes",
            "name": "data",
            "type": "bytes"
          }
        ],
        "internalType": "struct ModuleTransaction.Transaction[]",
        "name": "_txs",
        "type": "tuple[]"
      }
    ],
    "name": "selfExecute",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "_source",
        "type": "bytes32"
      }
    ],
    "name": "setSource",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes4",
        "name": "_interfaceID",
        "type": "bytes4"
      }
    ],
    "name": "supportsInterface",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "pure",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint32",
        "name": "_metaNonce",
        "type": "uint32"
      },
      {
        "internalType": "bytes32",
        "name": "_keysetHash",
        "type": "bytes32"
      },
      {
        "internalType": "uint32",
        "name": "_newTimeLockDuring",
        "type": "uint32"
      },
      {
        "internalType": "address",
        "name": "_newImplementation",
        "type": "address"
      },
      {
        "internalType": "bytes",
        "name": "_signature",
        "type": "bytes"
      }
    ],
    "name": "syncAccount",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint32",
        "name": "_metaNonce",
        "type": "uint32"
      }
    ],
    "name": "unlockKeysetHash",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint32",
        "name": "_metaNonce",
        "type": "uint32"
      },
      {
        "internalType": "address",
        "name": "_newImplementation",
        "type": "address"
      },
      {
        "internalType": "bytes",
        "name": "_signature",
        "type": "bytes"
      }
    ],
    "name": "updateImplementation",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint32",
        "name": "_metaNonce",
        "type": "uint32"
      },
      {
        "internalType": "bytes32",
        "name": "_newKeysetHash",
        "type": "bytes32"
      },
      {
        "internalType": "bytes",
        "name": "_signature",
        "type": "bytes"
      }
    ],
    "name": "updateKeysetHash",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint32",
        "name": "_metaNonce",
        "type": "uint32"
      },
      {
        "internalType": "bytes32",
        "name": "_newKeysetHash",
        "type": "bytes32"
      },
      {
        "internalType": "bytes",
        "name": "_signature",
        "type": "bytes"
      }
    ],
    "name": "updateKeysetHashWithTimeLock",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint32",
        "name": "_metaNonce",
        "type": "uint32"
      },
      {
        "internalType": "uint32",
        "name": "_newTimeLockDuring",
        "type": "uint32"
      },
      {
        "internalType": "bytes",
        "name": "_signature",
        "type": "bytes"
      }
    ],
    "name": "updateTimeLockDuring",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "_hash",
        "type": "bytes32"
      },
      {
        "internalType": "bytes",
        "name": "_signature",
        "type": "bytes"
      }
    ],
    "name": "validateSignature",
    "outputs": [
      {
        "internalType": "bool",
        "name": "succ",
        "type": "bool"
      },
      {
        "internalType": "enum IDkimKeys.EmailType",
        "name": "emailType",
        "type": "uint8"
      },
      {
        "internalType": "uint32",
        "name": "ownerWeight",
        "type": "uint32"
      },
      {
        "internalType": "uint32",
        "name": "assetsOpWeight",
        "type": "uint32"
      },
      {
        "internalType": "uint32",
        "name": "guardianWeight",
        "type": "uint32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "stateMutability": "payable",
    "type": "receive"
  }
]`;

const contractInterface = new Interface(abi);

contractInterface.fragments.forEach((v) => {
  try {
    console.log(v.name, contractInterface.getSighash(v));
  } catch (error) {}
});
