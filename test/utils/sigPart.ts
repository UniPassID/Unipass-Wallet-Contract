import { BigNumber, utils, Wallet } from "ethers";
import { arrayify, keccak256, solidityPack } from "ethers/lib/utils";
import { ethers } from "hardhat";
import {
  DkimParams,
  emailHash,
  getSignEmailWithDkim,
  parseEmailParams,
  pureEmailHash,
  SerializeDkimParams,
} from "./email";

export enum ActionType {
  UpdateKeysetHash = 0,
  UpdateTimeLock = 1,
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
  CallAccountLayer,
  CallHooks,
}

export enum SignerType {
  EIP712 = 1,
  EthSign = 2,
}

export interface Transaction {
  callType: CallType;
  gasLimit: BigNumber;
  target: string;
  value: number;
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

export async function generateAccountLayerSignature(
  contractAddr: string,
  actionType: ActionType,
  metaNonce: number,
  newDelay: number | undefined,
  newKeysetHash: string | undefined,
  masterKey: Wallet,
  threshold: number,
  recoveryEmails: string[],
  sigType: SigType | undefined
): Promise<string> {
  let sig = ethers.utils.solidityPack(
    ["uint8", "uint32"],
    [actionType, metaNonce]
  );
  switch (actionType) {
    case ActionType.UpdateKeysetHash: {
      sig = solidityPack(["bytes", "bytes32"], [sig, newKeysetHash]);
      const digestHash = keccak256(
        solidityPack(
          ["uint32", "address", "bytes32"],
          [metaNonce, contractAddr, newKeysetHash]
        )
      );
      sig = solidityPack(["bytes", "uint8"], [sig, sigType]);
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
          let indexes = [...Array(threshold).keys()].map((v) => v + 1);
          let index = 0;
          for (const recoveryEmail of recoveryEmails) {
            if (indexes.includes(index) === true) {
              let email = await getSignEmailWithDkim(
                digestHash,
                recoveryEmail,
                "test@unipass.id.com"
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
          let indexes = [...Array(threshold).keys()].map((v) => v + 1);
          let index = 0;
          for (const recoveryEmail of recoveryEmails) {
            if (indexes.includes(index) === true) {
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

        default: {
          throw new Error(`invalid sigType: ${sigType}`);
        }
      }
      break;
    }
    case ActionType.UpdateTimeLock: {
      const digestHash = keccak256(
        solidityPack(
          ["uint32", "address", "uint32"],
          [metaNonce, contractAddr, newDelay]
        )
      );

      let recoveryEmailWithDkim: [string, DkimParams | null][] = [];
      const masterKeySig = await signerSign(digestHash, masterKey);
      let indexes = [...Array(threshold).keys()].map((v) => v + 1);
      let index = 0;
      for (const recoveryEmail of recoveryEmails) {
        if (indexes.includes(index)) {
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
        ["bytes", "uint32", "bytes"],
        [
          sig,
          newDelay,
          generateSigMasterKeyWithRecoveryEmails(
            masterKeySig,
            threshold,
            recoveryEmailWithDkim
          ),
        ]
      );

      break;
    }
    default: {
      throw `invalid actionType: ${actionType}`;
    }
  }
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
      let index = 0;
      let recoveryEmailWithDkim: [string, DkimParams | null][] = [];
      for (const recoveryEmail of recoveryEmails) {
        if (recoveryEmailsIndexes.includes(index) === true) {
          let email = await getSignEmailWithDkim(
            digestHash,
            recoveryEmail,
            "test@unipass.id.com"
          );
          let { params, from } = await parseEmailParams(email);
          recoveryEmailWithDkim.push([emailHash(recoveryEmail), params]);
        } else {
          recoveryEmailWithDkim.push([emailHash(recoveryEmail), null]);
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
      const masterKeySig = await signerSign(digestHash, masterKey);
      let index = 0;
      let recoveryEmailWithDkim: [string, DkimParams | null][] = [];
      for (const recoveryEmail of recoveryEmails) {
        if (recoveryEmailsIndexes.includes(index) === true) {
          let email = await getSignEmailWithDkim(
            digestHash,
            recoveryEmail,
            "test@unipass.id.com"
          );
          let { params, from } = await parseEmailParams(email);
          recoveryEmailWithDkim.push([emailHash(recoveryEmail), params]);
        } else {
          recoveryEmailWithDkim.push([emailHash(recoveryEmail), null]);
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
      throw `Invalid SigType: ${sigType}`;
    }
  }
  return sig;
}
