import { BigNumber, Contract, utils, Wallet } from "ethers";
import {
  arrayify,
  BytesLike,
  Interface,
  keccak256,
  solidityPack,
} from "ethers/lib/utils";
import { ethers } from "hardhat";
import {
  DkimParams,
  getSignEmailWithDkim,
  parseEmailParams,
  pureEmailHash,
  SerializeDkimParams,
} from "./email";
import { UserOperation } from "./userOperation";

export enum ActionType {
  UpdateKeysetHash = 0,
  UnlockKeysetHash = 1,
  CancelLockKeysetHash = 2,
  UpdateTimeLockDuring = 3,
  UpdateImplementation = 4,
  UpdateEntryPoint = 5,
}

export enum SigType {
  SigMasterKey = 0,
  SigRecoveryEmail = 1,
  SigMasterKeyWithRecoveryEmail = 2,
  SigSessionKey = 3,
  SigNone = 4,
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
  masterKey: Wallet,
  threshold: number,
  recoveryEmails: string[],
  recoveryEmailsIndexes: number[],
  sessionKey: Wallet | undefined,
  expired: number | undefined,
  sigType: SigType
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
  let sig: string = await generateSignature(
    sigType,
    digestHash,
    sessionKey,
    expired,
    masterKey,
    threshold,
    recoveryEmailsIndexes,
    recoveryEmails
  );

  return sig;
}

export async function generateUpdateKeysetHashTx(
  contract: Contract,
  metaNonce: number,
  newKeysetHash: string,
  masterKey: Wallet,
  threshold: number,
  recoveryEmailsIndexes: number[],
  recoveryEmails: string[],
  sigType: SigType
) {
  const digestHash = keccak256(
    solidityPack(
      ["uint32", "address", "uint8", "bytes32"],
      [metaNonce, contract.address, ActionType.UpdateKeysetHash, newKeysetHash]
    )
  );

  const data = contract.interface.encodeFunctionData("updateKeysetHash", [
    metaNonce,
    newKeysetHash,
    await generateSignature(
      sigType,
      digestHash,
      undefined,
      undefined,
      masterKey,
      threshold,
      recoveryEmailsIndexes,
      recoveryEmails
    ),
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
  masterKey: Wallet,
  threshold: number,
  recoveryEmailsIndexes: number[],
  recoveryEmails: string[],
  sigType: SigType
) {
  const digestHash = keccak256(
    solidityPack(
      ["uint32", "address", "uint8"],
      [metaNonce, contract.address, ActionType.CancelLockKeysetHash]
    )
  );
  const data = contract.interface.encodeFunctionData("cancelLockKeysetHsah", [
    metaNonce,
    await generateSignature(
      sigType,
      digestHash,
      undefined,
      undefined,
      masterKey,
      threshold,
      recoveryEmailsIndexes,
      recoveryEmails
    ),
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
  masterKey: Wallet,
  threshold: number,
  recoveryEmailsIndexes: number[],
  recoveryEmails: string[],
  sigType: SigType
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
  if (sigType === undefined) {
    throw new Error("Expected sigType");
  }

  const data = contract.interface.encodeFunctionData("updateTimeLockDuring", [
    metaNonce,
    newTimeLockDuring,
    await generateSignature(
      sigType,
      digestHash,
      undefined,
      undefined,
      masterKey,
      threshold,
      recoveryEmailsIndexes,
      recoveryEmails
    ),
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
  masterKey: Wallet,
  threshold: number,
  recoveryEmailsIndexes: number[],
  recoveryEmails: string[]
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
    await generateSignature(
      SigType.SigMasterKeyWithRecoveryEmail,
      digestHash,
      undefined,
      undefined,
      masterKey,
      threshold,
      recoveryEmailsIndexes,
      recoveryEmails
    ),
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

export function generateRemoveSigWeightOfSelector(
  contract: Contract,
  selector: BytesLike
) {
  const data = contract.interface.encodeFunctionData(
    "removeSigWeightOfSelector",
    [selector]
  );
  let tx = {
    callType: CallType.Call,
    gasLimit: ethers.constants.Zero,
    target: contract.address,
    value: ethers.constants.Zero,
    data,
  };
  return tx;
}

export function generateAddSigWeightOfSelector(
  contract: Contract,
  selector: BytesLike,
  sigWeight: number
) {
  const data = contract.interface.encodeFunctionData("addSigWeightOfSelector", [
    selector,
    sigWeight,
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
  masterKey: Wallet,
  threshold: number,
  recoveryEmails: string[],
  sessionKey: Wallet,
  expired: number,
  moduleMain: Contract,
  sigType: SigType
) {
  const feeToken = ethers.constants.AddressZero;
  const feeReceiver = ethers.constants.AddressZero;
  const feeAmount = 0;

  const signature = await generateTransactionSig(
    chainId,
    txs,
    nonce,
    feeToken,
    feeAmount,
    masterKey,
    threshold,
    recoveryEmails,
    [...Array(threshold).keys()].map((v) => v + 1),
    sessionKey,
    expired,
    sigType
  );
  const ret = await (
    await moduleMain.execute(txs, nonce, feeToken, feeReceiver, 0, signature)
  ).wait();
  return ret;
}

export async function generateSignature(
  sigType: SigType,
  digestHash: string,
  sessionKey: Wallet | undefined,
  expired: number | undefined,
  masterKey: Wallet,
  threshold: number,
  recoveryEmailsIndexes: number[],
  recoveryEmails: string[]
): Promise<string> {
  let sig: string = solidityPack(["uint8"], [sigType]);
  switch (sigType) {
    case SigType.SigMasterKey: {
      const masterKeySig = await signerSign(digestHash, masterKey);
      sig = solidityPack(
        ["bytes", "bytes"],
        [sig, generateSigMasterKey(masterKeySig, threshold, recoveryEmails)]
      );
      break;
    }
    case SigType.SigRecoveryEmail: {
      let recoveryEmailWithDkim: [string, DkimParams | null][] = [];
      let index = 0;
      for (const recoveryEmail of recoveryEmails) {
        if (recoveryEmailsIndexes.includes(index) === true) {
          let email = await getSignEmailWithDkim(
            digestHash,
            recoveryEmail,
            "test@unipass.id.com"
          );
          let { params } = await parseEmailParams(email);
          recoveryEmailWithDkim.push([recoveryEmail, params]);
        } else {
          recoveryEmailWithDkim.push([recoveryEmail, null]);
        }
        index++;
      }
      sig = solidityPack(
        ["bytes", "bytes"],
        [
          sig,
          generateSigRecoveryEmails(
            masterKey.address,
            threshold,
            recoveryEmailWithDkim
          ),
        ]
      );
      break;
    }
    case SigType.SigMasterKeyWithRecoveryEmail: {
      let recoveryEmailWithDkim: [string, DkimParams | null][] = [];
      const masterKeySig = await signerSign(digestHash, masterKey);
      let index = 0;
      for (const recoveryEmail of recoveryEmails) {
        if (recoveryEmailsIndexes.includes(index) === true) {
          let email = await getSignEmailWithDkim(
            digestHash,
            recoveryEmail,
            "test@unipass.me"
          );
          let { params, from } = await parseEmailParams(email);
          recoveryEmailWithDkim.push([recoveryEmail, params]);
        } else {
          recoveryEmailWithDkim.push([recoveryEmail, null]);
        }
        index++;
      }
      sig = solidityPack(
        ["bytes", "bytes"],
        [
          sig,
          generateSigMasterKeyWithRecoveryEmails(
            masterKeySig,
            threshold,
            recoveryEmailWithDkim
          ),
        ]
      );
      break;
    }
    case SigType.SigSessionKey: {
      if (sessionKey === undefined) {
        throw "expected Session Key";
      }
      if (expired === undefined) {
        throw "expected Expired";
      }
      sig = solidityPack(
        ["bytes", "bytes"],
        [
          sig,
          await generateSessionKey(
            masterKey,
            threshold,
            recoveryEmails,
            digestHash,
            sessionKey,
            expired
          ),
        ]
      );
      break;
    }
    case SigType.SigNone: {
      break;
    }

    default: {
      throw new Error(`invalid sigType: ${sigType}`);
    }
  }
  return sig;
}
