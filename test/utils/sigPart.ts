import { BigNumber, Contract, Overrides, utils, Wallet } from "ethers";
import { arrayify, BytesLike, keccak256, solidityPack } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { KeyBase } from "./key";

export enum ActionType {
  UpdateKeysetHash = 0,
  UnlockKeysetHash = 1,
  CancelLockKeysetHash = 2,
  UpdateTimeLockDuring = 3,
  UpdateImplementation = 4,
  SyncAccount = 6,
}

export enum Role {
  Owner,
  AssetsOp,
  Guardian,
}

export enum CallType {
  Call,
  DelegateCall,
}

export enum SignerType {
  EIP712 = 1,
  EthSign = 2,
}

export interface Transaction {
  callType: CallType;
  gasLimit: BigNumber;
  target: BytesLike;
  value: BigNumber;
  data: string;
}

export async function signerSign(hash: string, signer: Wallet): Promise<string> {
  return solidityPack(["bytes", "uint8"], [await signer.signMessage(arrayify(hash)), SignerType.EthSign]);
}

export function generateTransactionHash(
  chainId: number,
  tx: Transaction[],
  nonce: number,
  feeToken: string,
  feeAmount: number
): string {
  const digestHash = keccak256(
    solidityPack(
      ["uint256", "bytes32", "address", "uint256"],
      [
        chainId,
        keccak256(
          utils.defaultAbiCoder.encode(
            ["uint256", "tuple(uint8 callType,uint256 gasLimit,address target,uint256 value,bytes data)[]"],
            [nonce, tx]
          )
        ),
        feeToken,
        feeAmount,
      ]
    )
  );
  return digestHash;
}

export async function generateTransactionSig(
  chainId: number,
  tx: Transaction[],
  nonce: number,
  feeToken: string,
  feeAmount: number,
  keys: [KeyBase, boolean][],
  sessionKey: SessionKey | undefined
): Promise<string> {
  const digestHash = generateTransactionHash(chainId, tx, nonce, feeToken, feeAmount);
  let sig: string = await generateSignature(digestHash, keys, sessionKey);

  return sig;
}

export async function generateSyncAccountTx(
  contract: Contract,
  metaNonce: number,
  newKeysetHash: string,
  newTimeLockDuring: number,
  keys: [KeyBase, boolean][]
) {
  const digestHash = keccak256(
    solidityPack(
      ["uint32", "address", "uint8", "bytes32", "uint32"],
      [metaNonce, contract.address, ActionType.SyncAccount, newKeysetHash, newTimeLockDuring]
    )
  );

  const data = contract.interface.encodeFunctionData("syncAccount", [
    metaNonce,
    newKeysetHash,
    newTimeLockDuring,
    await generateSignature(digestHash, keys, undefined),
  ]);

  let tx = {
    callType: CallType.Call,
    gasLimit: ethers.constants.Zero,
    target: contract.address,
    value: ethers.constants.Zero,
    data,
  };
  return tx;
}

export async function generateUpdateKeysetHashTx(
  contract: Contract,
  metaNonce: number,
  newKeysetHash: string,
  withTimeLock: boolean,
  keys: [KeyBase, boolean][]
) {
  const digestHash = keccak256(
    solidityPack(
      ["uint32", "address", "uint8", "bytes32"],
      [metaNonce, contract.address, ActionType.UpdateKeysetHash, newKeysetHash]
    )
  );

  let func: string;
  if (withTimeLock) {
    func = "updateKeysetHashWithTimeLock";
  } else {
    func = "updateKeysetHash";
  }
  const data = contract.interface.encodeFunctionData(func, [
    metaNonce,
    newKeysetHash,
    await generateSignature(digestHash, keys, undefined),
  ]);

  let tx = {
    callType: CallType.Call,
    gasLimit: ethers.constants.Zero,
    target: contract.address,
    value: ethers.constants.Zero,
    data,
  };
  return tx;
}

export async function generateUnlockKeysetHashTx(contract: Contract, metaNonce: number) {
  const data = contract.interface.encodeFunctionData("unlockKeysetHash", [metaNonce]);

  let tx = {
    callType: CallType.Call,
    gasLimit: ethers.constants.Zero,
    target: contract.address,
    value: ethers.constants.Zero,
    data,
  };
  return tx;
}

export async function generateCancelLockKeysetHashTx(contract: Contract, metaNonce: number, keys: [KeyBase, boolean][]) {
  const digestHash = keccak256(
    solidityPack(["uint32", "address", "uint8"], [metaNonce, contract.address, ActionType.CancelLockKeysetHash])
  );
  const data = contract.interface.encodeFunctionData("cancelLockKeysetHsah", [
    metaNonce,
    await generateSignature(digestHash, keys, undefined),
  ]);

  let tx = {
    callType: CallType.Call,
    gasLimit: ethers.constants.Zero,
    target: contract.address,
    value: ethers.constants.Zero,
    data,
  };
  return tx;
}

export async function generateUpdateTimeLockDuringTx(
  contract: Contract,
  metaNonce: number,
  newTimeLockDuring: number,
  keys: [KeyBase, boolean][]
) {
  const digestHash = keccak256(
    solidityPack(
      ["uint32", "address", "uint8", "uint32"],
      [metaNonce, contract.address, ActionType.UpdateTimeLockDuring, newTimeLockDuring]
    )
  );

  const data = contract.interface.encodeFunctionData("updateTimeLockDuring", [
    metaNonce,
    newTimeLockDuring,
    await generateSignature(digestHash, keys, undefined),
  ]);

  let tx = {
    callType: CallType.Call,
    gasLimit: ethers.constants.Zero,
    target: contract.address,
    value: ethers.constants.Zero,
    data,
  };
  return tx;
}

export async function generateTransferTx(target: BytesLike, gasLimit: BigNumber, value: BigNumber) {
  let tx = {
    callType: CallType.Call,
    gasLimit,
    target,
    value,
    data: "0x",
  };
  return tx;
}

export async function generateUpdateImplementationTx(
  contract: Contract,
  metaNonce: number,
  newImplementation: string,
  keys: [KeyBase, boolean][]
) {
  const digestHash = keccak256(
    solidityPack(
      ["uint32", "address", "uint8", "address"],
      [metaNonce, contract.address, ActionType.UpdateImplementation, newImplementation]
    )
  );

  const data = contract.interface.encodeFunctionData("updateImplementation", [
    metaNonce,
    newImplementation,
    await generateSignature(digestHash, keys, undefined),
  ]);

  let tx = {
    callType: CallType.Call,
    gasLimit: ethers.constants.Zero,
    target: contract.address,
    value: ethers.constants.Zero,
    data,
  };
  return tx;
}

export function generateUpdateEntryPointTx(contract: Contract, eip4337WalletNonce: number, newEntryPoint: string) {
  const data = contract.interface.encodeFunctionData("updateEntryPoint", [eip4337WalletNonce, newEntryPoint]);
  let tx = {
    callType: CallType.Call,
    gasLimit: ethers.constants.Zero,
    target: contract.address,
    value: ethers.constants.Zero,
    data,
  };
  return tx;
}

export function generateRemovePermissionTx(contract: Contract, selector: BytesLike) {
  const data = contract.interface.encodeFunctionData("removePermission", [selector]);
  let tx = {
    callType: CallType.Call,
    gasLimit: ethers.constants.Zero,
    target: contract.address,
    value: ethers.constants.Zero,
    data,
  };
  return tx;
}

export function generateAddPermissionTx(contract: Contract, role: Role, selector: BytesLike, threshold: number) {
  const data = contract.interface.encodeFunctionData("addPermission", [role, selector, threshold]);
  let tx = {
    callType: CallType.Call,
    gasLimit: ethers.constants.Zero,
    target: contract.address,
    value: ethers.constants.Zero,
    data,
  };
  return tx;
}

export async function executeCall(
  txs: Transaction[],
  chainId: number,
  nonce: number,
  keys: [KeyBase, boolean][],
  moduleMain: Contract,
  sessionKey: SessionKey | undefined,
  txParams: Overrides
) {
  const feeToken = ethers.constants.AddressZero;
  const feeReceiver = ethers.constants.AddressZero;
  const feeAmount = 0;

  let signature = await generateTransactionSig(chainId, txs, nonce, feeToken, feeAmount, keys, sessionKey);

  const ret = await (await moduleMain.execute(txs, nonce, feeToken, feeReceiver, 0, signature, txParams)).wait();
  return ret;
}

export interface SessionKey {
  timestamp: number;
  weight: number;
  key: Wallet;
}

export async function generateSignature(
  digestHash: string,
  keys: [KeyBase, boolean][],
  sessionKey: SessionKey | undefined
): Promise<string> {
  let sig: string;
  if (keys.length === 0) {
    return "0x";
  }
  if (sessionKey === undefined) {
    sig = solidityPack(["uint8"], [0]);
  } else {
    sig = solidityPack(
      ["uint8", "uint32", "uint32", "bytes"],
      [1, sessionKey.timestamp, sessionKey.weight, await signerSign(digestHash, sessionKey.key)]
    );
    digestHash = keccak256(
      solidityPack(["address", "uint32", "uint32"], [sessionKey.key.address, sessionKey.timestamp, sessionKey.weight])
    );
  }
  for (const [key, isSig] of keys) {
    if (isSig) {
      sig = solidityPack(["bytes", "bytes"], [sig, await key.generateSignature(digestHash)]);
    } else {
      sig = solidityPack(["bytes", "bytes"], [sig, await key.generateKey()]);
    }
  }
  return sig;
}
