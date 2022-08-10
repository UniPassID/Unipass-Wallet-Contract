import { BigNumber, Contract, utils, Wallet } from "ethers";
import {
  arrayify,
  BytesLike,
  Interface,
  keccak256,
  solidityPack,
} from "ethers/lib/utils";
import { ethers } from "hardhat";
import { DkimParams, pureEmailHash, SerializeDkimParams } from "./email";
import { KeyBase } from "./key";

export enum ActionType {
  UpdateKeysetHash = 0,
  UnlockKeysetHash = 1,
  CancelLockKeysetHash = 2,
  UpdateTimeLockDuring = 3,
  UpdateImplementation = 4,
  UpdateEntryPoint = 5,
}

export enum Role {
  Owner,
  AssetsOp,
  Guardian,
  Synchronizer,
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

export async function signerSign(
  hash: string,
  signer: Wallet
): Promise<string> {
  return solidityPack(
    ["bytes", "uint8"],
    [await signer.signMessage(arrayify(hash)), SignerType.EthSign]
  );
}

export function generateSigMasterKey(
  masterKeySig: string,
  threshold: number,
  recoveryEmails: string[]
): string {
  let sig = solidityPack(["bytes", "uint16"], [masterKeySig, threshold]);
  recoveryEmails.forEach((recoveryEmail) => {
    sig = solidityPack(
      ["bytes", "bytes32"],
      [sig, pureEmailHash(recoveryEmail)]
    );
  });
  return sig;
}

export function generateSigRecoveryEmails(
  masterKey: string,
  threshold: number,
  recoveryEmails: [string, DkimParams | null][]
): string {
  let sig = solidityPack(["address", "uint16"], [masterKey, threshold]);
  for (const recoveryEmail of recoveryEmails) {
    if (recoveryEmail[1] === null) {
      sig = solidityPack(
        ["bytes", "uint8", "uint8", "bytes"],
        [sig, 0, recoveryEmail[0].length, Buffer.from(recoveryEmail[0])]
      );
    } else {
      sig = solidityPack(
        ["bytes", "uint8", "uint8", "bytes", "bytes"],
        [
          sig,
          1,
          recoveryEmail[0].length,
          Buffer.from(recoveryEmail[0]),
          SerializeDkimParams(recoveryEmail[1]),
        ]
      );
    }
  }
  return sig;
}

export function generateSigMasterKeyWithRecoveryEmails(
  masterKeySig: string,
  threshold: number,
  recoveryEmails: [string, DkimParams | null][]
): string {
  let sig = solidityPack(["bytes", "uint16"], [masterKeySig, threshold]);
  for (const recoveryEmail of recoveryEmails) {
    if (recoveryEmail[1] === null) {
      sig = solidityPack(
        ["bytes", "uint8", "uint8", "bytes"],
        [sig, 0, recoveryEmail[0].length, Buffer.from(recoveryEmail[0])]
      );
    } else {
      sig = solidityPack(
        ["bytes", "uint8", "uint8", "bytes", "bytes"],
        [
          sig,
          1,
          recoveryEmail[0].length,
          Buffer.from(recoveryEmail[0]),
          SerializeDkimParams(recoveryEmail[1]),
        ]
      );
    }
  }
  return sig;
}

export async function generateSessionKey(
  masterKey: Wallet,
  threshold: number,
  recoveryEmails: string[],
  digestHash: string,
  sessionKey: Wallet,
  expired: number
): Promise<string> {
  const permitMessage = keccak256(
    solidityPack(["address", "uint256"], [sessionKey.address, expired])
  );
  const permit = await signerSign(permitMessage, masterKey);
  const sessionKeySig = await signerSign(digestHash, sessionKey);
  const sig = solidityPack(
    ["address", "uint256", "bytes", "bytes"],
    [
      sessionKey.address,
      expired,
      sessionKeySig,
      generateSigMasterKey(permit, threshold, recoveryEmails),
    ]
  );
  return sig;
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
  const digestHash = keccak256(
    solidityPack(
      ["uint256", "bytes32", "address", "uint256"],
      [
        chainId,
        keccak256(
          utils.defaultAbiCoder.encode(
            [
              "uint256",
              "tuple(uint8 callType,uint256 gasLimit,address target,uint256 value,bytes data)[]",
            ],
            [nonce, tx]
          )
        ),
        feeToken,
        feeAmount,
      ]
    )
  );
  let sig: string = await generateSignature(digestHash, keys, sessionKey);

  return sig;
}

export async function generateUpdateKeysetHashTx(
  contract: Contract,
  metaNonce: number,
  newKeysetHash: string,
  role: Role,
  keys: [KeyBase, boolean][]
) {
  const digestHash = keccak256(
    solidityPack(
      ["uint32", "address", "uint8", "bytes32"],
      [metaNonce, contract.address, ActionType.UpdateKeysetHash, newKeysetHash]
    )
  );

  let func: string;
  if (role === Role.Guardian) {
    func = "updateKeysetHashByGuardian";
  } else if (role === Role.Owner) {
    func = "updateKeysetHashByOwner";
  } else {
    throw new Error(`Invalid Role: ${role}`);
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

export async function generateUnlockKeysetHashTx(
  contract: Contract,
  metaNonce: number,
  contractInterface: Interface
) {
  const data = contractInterface.encodeFunctionData("unlockKeysetHash", [
    metaNonce,
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

export async function generateCancelLockKeysetHashTx(
  contract: Contract,
  metaNonce: number,
  keys: [KeyBase, boolean][]
) {
  const digestHash = keccak256(
    solidityPack(
      ["uint32", "address", "uint8"],
      [metaNonce, contract.address, ActionType.CancelLockKeysetHash]
    )
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
      [
        metaNonce,
        contract.address,
        ActionType.UpdateTimeLockDuring,
        newTimeLockDuring,
      ]
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

export async function generateTransferTx(
  target: BytesLike,
  gasLimit: BigNumber,
  value: BigNumber
) {
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
      [
        metaNonce,
        contract.address,
        ActionType.UpdateImplementation,
        newImplementation,
      ]
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

export function generateUpdateEntryPointTx(
  contract: Contract,
  eip4337WalletNonce: number,
  newEntryPoint: string
) {
  const data = contract.interface.encodeFunctionData("updateEntryPoint", [
    eip4337WalletNonce,
    newEntryPoint,
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

export function generateRemovePermissionTx(
  contract: Contract,
  selector: BytesLike
) {
  const data = contract.interface.encodeFunctionData("removePermission", [
    selector,
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

export function generateAddPermissionTx(
  contract: Contract,
  role: Role,
  selector: BytesLike,
  threshold: number
) {
  const data = contract.interface.encodeFunctionData("addPermission", [
    role,
    selector,
    threshold,
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

export async function executeCall(
  txs: Transaction[],
  chainId: number,
  nonce: number,
  keys: [KeyBase, boolean][],
  moduleMain: Contract,
  sessionKey: SessionKey | undefined
) {
  const feeToken = ethers.constants.AddressZero;
  const feeReceiver = ethers.constants.AddressZero;
  const feeAmount = 0;

  let signature = await generateTransactionSig(
    chainId,
    txs,
    nonce,
    feeToken,
    feeAmount,
    keys,
    sessionKey
  );

  const ret = await (
    await moduleMain.execute(txs, nonce, feeToken, feeReceiver, 0, signature)
  ).wait();
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
      [
        1,
        sessionKey.timestamp,
        sessionKey.weight,
        await signerSign(digestHash, sessionKey.key),
      ]
    );
    digestHash = keccak256(
      solidityPack(
        ["address", "uint32", "uint32"],
        [sessionKey.key.address, sessionKey.timestamp, sessionKey.weight]
      )
    );
  }
  for (const [key, isSig] of keys) {
    if (isSig) {
      sig = solidityPack(
        ["bytes", "bytes"],
        [sig, await key.generateSignature(digestHash)]
      );
    } else {
      sig = solidityPack(["bytes", "bytes"], [sig, await key.generateKey()]);
    }
  }
  return sig;
}
