// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { getContractFactory } from "@nomiclabs/hardhat-ethers/types";
import { Contract, ContractFactory } from "ethers";
import { defaultAbiCoder, Interface } from "ethers/lib/utils";
import { ethers } from "hardhat";

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  // We get the contract to deploy
  const inf = new Interface(`[
		{
			"inputs": [
				{
					"internalType": "address",
					"name": "_factory",
					"type": "address"
				}
			],
			"stateMutability": "nonpayable",
			"type": "constructor"
		},
		{
			"anonymous": false,
			"inputs": [
				{
					"indexed": false,
					"internalType": "address",
					"name": "_contract",
					"type": "address"
				}
			],
			"name": "CreatedContract",
			"type": "event"
		},
		{
			"anonymous": false,
			"inputs": [
				{
					"indexed": false,
					"internalType": "address",
					"name": "newImplementation",
					"type": "address"
				}
			],
			"name": "ImplementationUpdated",
			"type": "event"
		},
		{
			"anonymous": false,
			"inputs": [
				{
					"indexed": false,
					"internalType": "uint256",
					"name": "_space",
					"type": "uint256"
				},
				{
					"indexed": false,
					"internalType": "uint256",
					"name": "_newNonce",
					"type": "uint256"
				}
			],
			"name": "NonceChange",
			"type": "event"
		},
		{
			"anonymous": true,
			"inputs": [
				{
					"indexed": false,
					"internalType": "bytes32",
					"name": "_tx",
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
					"name": "_tx",
					"type": "bytes32"
				},
				{
					"indexed": false,
					"internalType": "bytes",
					"name": "_reason",
					"type": "bytes"
				}
			],
			"name": "TxFailed",
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
			"inputs": [
				{
					"internalType": "bytes4",
					"name": "_signature",
					"type": "bytes4"
				},
				{
					"internalType": "address",
					"name": "_implementation",
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
					"internalType": "bytes",
					"name": "_code",
					"type": "bytes"
				}
			],
			"name": "createContract",
			"outputs": [
				{
					"internalType": "address",
					"name": "addr",
					"type": "address"
				}
			],
			"stateMutability": "payable",
			"type": "function"
		},
		{
			"inputs": [
				{
					"components": [
						{
							"internalType": "bool",
							"name": "delegateCall",
							"type": "bool"
						},
						{
							"internalType": "bool",
							"name": "revertOnError",
							"type": "bool"
						},
						{
							"internalType": "uint256",
							"name": "gasLimit",
							"type": "uint256"
						},
						{
							"internalType": "address",
							"name": "target",
							"type": "address"
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
					"internalType": "struct IModuleCalls.Transaction[]",
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
					"name": "_signatures",
					"type": "bytes"
				}
			],
			"name": "isValidSignature",
			"outputs": [
				{
					"internalType": "bytes4",
					"name": "",
					"type": "bytes4"
				}
			],
			"stateMutability": "view",
			"type": "function"
		},
		{
			"inputs": [
				{
					"internalType": "bytes",
					"name": "_data",
					"type": "bytes"
				},
				{
					"internalType": "bytes",
					"name": "_signatures",
					"type": "bytes"
				}
			],
			"name": "isValidSignature",
			"outputs": [
				{
					"internalType": "bytes4",
					"name": "",
					"type": "bytes4"
				}
			],
			"stateMutability": "view",
			"type": "function"
		},
		{
			"inputs": [],
			"name": "nonce",
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
			"stateMutability": "nonpayable",
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
			"stateMutability": "nonpayable",
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
			"stateMutability": "nonpayable",
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
					"internalType": "uint256",
					"name": "_space",
					"type": "uint256"
				}
			],
			"name": "readNonce",
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
					"components": [
						{
							"internalType": "bool",
							"name": "delegateCall",
							"type": "bool"
						},
						{
							"internalType": "bool",
							"name": "revertOnError",
							"type": "bool"
						},
						{
							"internalType": "uint256",
							"name": "gasLimit",
							"type": "uint256"
						},
						{
							"internalType": "address",
							"name": "target",
							"type": "address"
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
					"internalType": "struct IModuleCalls.Transaction[]",
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
					"internalType": "address",
					"name": "_implementation",
					"type": "address"
				}
			],
			"name": "updateImplementation",
			"outputs": [],
			"stateMutability": "nonpayable",
			"type": "function"
		},
		{
			"stateMutability": "payable",
			"type": "receive"
		}
	]`);
  const tx = inf.parseTransaction({
    data: "0x7a9a16280000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000000000000000000000000005e000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000034580000000000000000000000000b73a3d73971bdb3521f4f13a74cac10e5d1d149e000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000000000000000044461c2926c0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000160000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000b73a3d73971bdb3521f4f13a74cac10e5d1d149e000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000000000000000002429561426c61edcd7480011b3265abab082b76af05c030559bb8c3d6b5a682f598945025a00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000d130b43062d875a4b7af3f8fc036bc6e9d3e1b3e000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000001a444d466c2000000000000000000000000b73a3d73971bdb3521f4f13a74cac10e5d1d149e000000000000000000000000000000000000000000000000000000000000000500000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000020000000000000000000000000e91b456002ceda39651002bbb018bd9b758d8a100000000000000000000000000000000000000000000000000000000000000020000000000000000000000008ef40396becf60528131e5c15269b49352bce664000000000000000000000000000000000000000000000000000000000000000300000000000000000000000092cc664a293d7ab0b3af0d6d31dff4a85ffedd2a00000000000000000000000000000000000000000000000000000000000000030000000000000000000000009999991af3420dfa7cd874d5cb3445793bb5f691000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000cc000500024116c71db5d16ec95db02a1e70ac664fa5af7d4cb6a8d28667a21944f068a74e76d584411f0df2e9c660df5236cf51e9e65c0d8c8938823543309bc6e6ed253b1b0201022e97a67d344b795a084ddb427da4fb7edd340f6f01028ef40396becf60528131e5c15269b49352bce664010392cc664a293d7ab0b3af0d6d31dff4a85ffedd2a0003f0072088ce57c3e0fe8178bf4a9dcd701e73e4f1044d7eb76818fddb3f279cf3052583ccd8f3a62b9681b9ba1bd5f86386ace37edf6dfbee7a7f90aeb873bc571c020000000000000000000000000000000000000000",
  });
  console.log(tx);
  console.log(tx.args[0]);
  const tx1 = inf.parseTransaction({
    data: "0x61c2926c0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000160000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000b73a3d73971bdb3521f4f13a74cac10e5d1d149e000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000000000000000002429561426c61edcd7480011b3265abab082b76af05c030559bb8c3d6b5a682f598945025a00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000d130b43062d875a4b7af3f8fc036bc6e9d3e1b3e000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000001a444d466c2000000000000000000000000b73a3d73971bdb3521f4f13a74cac10e5d1d149e000000000000000000000000000000000000000000000000000000000000000500000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000020000000000000000000000000e91b456002ceda39651002bbb018bd9b758d8a100000000000000000000000000000000000000000000000000000000000000020000000000000000000000008ef40396becf60528131e5c15269b49352bce664000000000000000000000000000000000000000000000000000000000000000300000000000000000000000092cc664a293d7ab0b3af0d6d31dff4a85ffedd2a00000000000000000000000000000000000000000000000000000000000000030000000000000000000000009999991af3420dfa7cd874d5cb3445793bb5f69100000000000000000000000000000000000000000000000000000000",
  });
  console.log(tx1);
  console.log(tx1.args[0]);
  console.log(tx1.args[1]);
  const tx2 = inf.parseTransaction({
    data: "0x29561426c61edcd7480011b3265abab082b76af05c030559bb8c3d6b5a682f598945025a",
  });
  console.log(tx2);
  const tx3 = inf.parseTransaction({
    data: "0x44d466c2000000000000000000000000b73a3d73971bdb3521f4f13a74cac10e5d1d149e000000000000000000000000000000000000000000000000000000000000000500000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000020000000000000000000000000e91b456002ceda39651002bbb018bd9b758d8a100000000000000000000000000000000000000000000000000000000000000020000000000000000000000008ef40396becf60528131e5c15269b49352bce664000000000000000000000000000000000000000000000000000000000000000300000000000000000000000092cc664a293d7ab0b3af0d6d31dff4a85ffedd2a00000000000000000000000000000000000000000000000000000000000000030000000000000000000000009999991af3420dfa7cd874d5cb3445793bb5f691",
  });
  console.log(tx3);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
