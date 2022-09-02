import { BigNumber, Contract, Overrides, utils, Wallet } from "ethers";
import { arrayify, BytesLike, keccak256, solidityPack } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { EmailType } from "./email";
import { KeyBase, KeyEmailAddress, RoleWeight } from "./key";

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

export interface SelfExecuteTransaction {
  transactions: Transaction[];
  roleWeightThreshold: RoleWeight;
}

export interface Transaction {
  callType: CallType;
  revertOnError: boolean;
  gasLimit: BigNumber;
  target: BytesLike;
  value: BigNumber;
  data: string | SelfExecuteTransaction;
}

export async function signerSign(hash: string, signer: Wallet): Promise<string> {
  return solidityPack(["bytes", "uint8"], [await signer.signMessage(arrayify(hash)), SignerType.EthSign]);
}

export async function generateTransactionHash(
  chainId: number,
  address: string,
  parsedTxs: Transaction[],
  nonce: number
): Promise<string> {
  let digestHash = keccak256(
    utils.defaultAbiCoder.encode(
      ["uint256", "tuple(uint8 callType,bool revertOnError,address target,uint256 gasLimit,uint256 value,bytes data)[]"],
      [nonce, parsedTxs]
    )
  );
  digestHash = subdigest(chainId, address, digestHash);
  return digestHash;
}

export function subdigest(chainId: number, address: string, hash: BytesLike): string {
  return keccak256(solidityPack(["bytes", "uint256", "address", "bytes32"], [Buffer.from("\x19\x01"), chainId, address, hash]));
}

export async function generateTransactionSig(
  chainId: number,
  address: string,
  txs: Transaction[],
  nonce: number,
  keys: [KeyBase, boolean][],
  sessionKey: SessionKey | undefined
): Promise<string> {
  const digestHash = await generateTransactionHash(chainId, address, txs, nonce);
  let sig: string = await generateSignature(digestHash, chainId, address, keys, sessionKey);

  return sig;
}

export async function generateSyncAccountTx(
  chainId: number,
  contract: Contract,
  metaNonce: number,
  newKeysetHash: string,
  newTimeLockDuring: number,
  newImplementation: string,
  keys: [KeyBase, boolean][]
) {
  const digestHash = subdigest(
    0,
    contract.address,
    keccak256(
      solidityPack(
        ["uint8", "uint32", "bytes32", "uint32", "address"],
        [ActionType.SyncAccount, metaNonce, newKeysetHash, newTimeLockDuring, newImplementation]
      )
    )
  );

  const data = contract.interface.encodeFunctionData("syncAccount", [
    metaNonce,
    newKeysetHash,
    newTimeLockDuring,
    newImplementation,
    await generateSignature(digestHash, chainId, contract.address, keys, undefined),
  ]);

  let tx = {
    callType: CallType.Call,
    gasLimit: ethers.constants.Zero,
    revertOnError: true,
    target: contract.address,
    value: ethers.constants.Zero,
    data,
  };
  return tx;
}

export async function generateUpdateKeysetHashTx(
  chainId: number,
  contract: Contract,
  metaNonce: number,
  newKeysetHash: string,
  withTimeLock: boolean,
  keys: [KeyBase, boolean][]
) {
  const digestHash = subdigest(
    0,
    contract.address,
    keccak256(solidityPack(["uint8", "uint32", "bytes32"], [ActionType.UpdateKeysetHash, metaNonce, newKeysetHash]))
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
    await generateSignature(
      digestHash,
      chainId,
      contract.address,
      keys.map((v) => {
        if (v[0] instanceof KeyEmailAddress) {
          v[0].emailType = EmailType.UpdateKeysetHash;
        }
        return v;
      }),
      undefined
    ),
  ]);

  let tx = {
    callType: CallType.Call,
    revertOnError: true,
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
    revertOnError: true,
    gasLimit: ethers.constants.Zero,
    target: contract.address,
    value: ethers.constants.Zero,
    data,
  };
  return tx;
}

export async function generateCancelLockKeysetHashTx(
  chainId: number,
  contract: Contract,
  metaNonce: number,
  keys: [KeyBase, boolean][]
) {
  const digestHash = subdigest(
    0,
    contract.address,
    keccak256(solidityPack(["uint8", "uint32"], [ActionType.CancelLockKeysetHash, metaNonce]))
  );
  const data = contract.interface.encodeFunctionData("cancelLockKeysetHsah", [
    metaNonce,
    await generateSignature(digestHash, chainId, contract.address, keys, undefined),
  ]);

  let tx = {
    callType: CallType.Call,
    revertOnError: true,
    gasLimit: ethers.constants.Zero,
    target: contract.address,
    value: ethers.constants.Zero,
    data,
  };
  return tx;
}

export async function generateUpdateTimeLockDuringTx(
  chainId: number,
  contract: Contract,
  metaNonce: number,
  newTimeLockDuring: number,
  keys: [KeyBase, boolean][]
) {
  const digestHash = subdigest(
    0,
    contract.address,
    keccak256(solidityPack(["uint8", "uint32", "uint32"], [ActionType.UpdateTimeLockDuring, metaNonce, newTimeLockDuring]))
  );
  const data = contract.interface.encodeFunctionData("updateTimeLockDuring", [
    metaNonce,
    newTimeLockDuring,
    await generateSignature(digestHash, chainId, contract.address, keys, undefined),
  ]);

  let tx = {
    callType: CallType.Call,
    gasLimit: ethers.constants.Zero,
    revertOnError: true,
    target: contract.address,
    value: ethers.constants.Zero,
    data,
  };
  return tx;
}

export async function generateTransferTx(target: BytesLike, gasLimit: BigNumber, value: BigNumber) {
  let tx = {
    callType: CallType.Call,
    revertOnError: true,
    gasLimit,
    target,
    value,
    data: "0x",
  };
  return tx;
}

export async function generateUpdateImplementationTx(
  chainId: number,
  contract: Contract,
  metaNonce: number,
  newImplementation: string,
  keys: [KeyBase, boolean][]
) {
  const digestHash = subdigest(
    0,
    contract.address,
    keccak256(solidityPack(["uint8", "uint32", "address"], [ActionType.UpdateImplementation, metaNonce, newImplementation]))
  );
  const data = contract.interface.encodeFunctionData("updateImplementation", [
    metaNonce,
    newImplementation,
    await generateSignature(digestHash, chainId, contract.address, keys, undefined),
  ]);

  let tx = {
    callType: CallType.Call,
    revertOnError: true,
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
    revertOnError: true,
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
    revertOnError: true,
    target: contract.address,
    value: ethers.constants.Zero,
    data,
  };
  return tx;
}

export function generateAddPermissionTx(contract: Contract, selector: BytesLike, roleWeight: RoleWeight) {
  const data = contract.interface.encodeFunctionData("addPermission", [
    selector,
    roleWeight.ownerWeight,
    roleWeight.assetsOpWeight,
    roleWeight.guardianWeight,
  ]);
  let tx = {
    callType: CallType.Call,
    revertOnError: true,
    gasLimit: ethers.constants.Zero,
    target: contract.address,
    value: ethers.constants.Zero,
    data,
  };
  return tx;
}

export async function parseTxs(txs: Transaction[]): Promise<Transaction[]> {
  const ModuleMain = await ethers.getContractFactory("ModuleMain");
  const parsedTxs: Transaction[] = txs.map((tx) => {
    if (typeof tx.data == "string") {
      return tx;
    }
    return {
      target: tx.target,
      callType: tx.callType,
      gasLimit: tx.gasLimit,
      revertOnError: tx.revertOnError,
      value: tx.value,
      data: ModuleMain.interface.encodeFunctionData("selfExecute", [
        tx.data.roleWeightThreshold.ownerWeight,
        tx.data.roleWeightThreshold.assetsOpWeight,
        tx.data.roleWeightThreshold.guardianWeight,
        tx.data.transactions,
      ]),
    };
  });
  return parsedTxs;
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
  const parsedTxs = await parseTxs(txs);
  let signature = await generateTransactionSig(chainId, moduleMain.address, parsedTxs, nonce, keys, sessionKey);

  const ret = await (await moduleMain.execute(parsedTxs, nonce, signature, txParams)).wait();
  return ret;
}

export interface SessionKey {
  timestamp: number;
  weight: number;
  key: Wallet;
}

export async function generateSignature(
  digestHash: string,
  chainId: number,
  contractAddr: string,
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
    digestHash = subdigest(
      chainId,
      contractAddr,
      keccak256(solidityPack(["address", "uint32", "uint32"], [sessionKey.key.address, sessionKey.timestamp, sessionKey.weight]))
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
