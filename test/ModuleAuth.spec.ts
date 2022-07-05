import { expect } from "chai";
import { Contract, Wallet } from "ethers";
import { ethers } from "hardhat";
import {
  DkimParams,
  emailHash,
  getSignEmailWithDkim,
  parseEmailParams,
  SerializeDkimParams,
} from "./utils/email";
import {
  arrayify,
  getCreate2Address,
  keccak256,
  solidityPack,
} from "ethers/lib/utils";

enum ActionType {
  UpdateKeySet = 0,
  UpdateTimeLock = 1,
}

enum SigType {
  SigMasterKey = 0,
  SigRecoveryEmail = 1,
  SigMasterKeyWithRecoveryEmail = 2,
}

export async function generateSignature(
  contractAddr: string,
  actionType: ActionType,
  nonce: number,
  newDelay: number | undefined,
  newKeySet: string | undefined,
  masterKey: Wallet,
  threshold: number,
  recoveryEmails: string[],
  sigType: SigType | undefined
): Promise<string> {
  let sig = ethers.utils.solidityPack(["uint8", "uint32"], [actionType, nonce]);
  switch (actionType) {
    case ActionType.UpdateKeySet: {
      const digestHash = keccak256(
        solidityPack(
          ["uint32", "address", "bytes32"],
          [nonce, contractAddr, newKeySet]
        )
      );
      sig = solidityPack(["bytes", "uint8"], [sig, sigType]);
      switch (sigType) {
        case SigType.SigMasterKey: {
          const masterKeySig = await masterKey.signMessage(
            arrayify(digestHash)
          );
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
              let dkimParams = await parseEmailParams(email);
              recoveryEmailWithDkim.push([
                emailHash(recoveryEmail),
                dkimParams,
              ]);
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
          let recoveryEmailWithDkim: [string, DkimParams | null][] = [];
          const masterKeySig = await masterKey.signMessage(
            arrayify(digestHash)
          );
          let indexes = [...Array(threshold).keys()].map((v) => v + 1);
          let index = 0;
          for (const recoveryEmail of recoveryEmails) {
            if (indexes.includes(index)) {
              let email = await getSignEmailWithDkim(
                digestHash,
                recoveryEmail,
                "test@unipass.me"
              );
              let DkimParams = await parseEmailParams(email);
              recoveryEmailWithDkim.push([
                emailHash(recoveryEmail),
                DkimParams,
              ]);
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
        default: {
          throw `invalid sigType: ${sigType}`;
        }
      }
      break;
    }
    case ActionType.UpdateTimeLock: {
      const digestHash = keccak256(
        solidityPack(
          ["uint32", "address", "uint32"],
          [nonce, contractAddr, newDelay]
        )
      );

      let recoveryEmailWithDkim: [string, DkimParams | null][] = [];
      const masterKeySig = await masterKey.signMessage(arrayify(digestHash));
      let indexes = [...Array(threshold).keys()].map((v) => v + 1);
      let index = 0;
      for (const recoveryEmail of recoveryEmails) {
        if (indexes.includes(index)) {
          let email = await getSignEmailWithDkim(
            digestHash,
            recoveryEmail,
            "test@unipass.me"
          );
          let DkimParams = await parseEmailParams(email);
          recoveryEmailWithDkim.push([emailHash(recoveryEmail), DkimParams]);
        } else {
          recoveryEmailWithDkim.push([emailHash(recoveryEmail), null]);
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

export function generateSigMasterKey(
  masterKeySig: string,
  threshold: number,
  recoveryEmails: string[]
): string {
  let sig = solidityPack(
    ["bytes", "uint8", "uint16"],
    [masterKeySig, 2, threshold]
  );
  recoveryEmails.forEach((recoveryEmail) => {
    sig = solidityPack(["bytes", "bytes32"], [sig, emailHash(recoveryEmail)]);
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
        ["bytes", "uint8", "bytes32"],
        [sig, 0, recoveryEmail[0]]
      );
    } else {
      sig = solidityPack(
        ["bytes", "uint8", "bytes32", "bytes"],
        [sig, 1, recoveryEmail[0], SerializeDkimParams(recoveryEmail[1])]
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
  let sig = solidityPack(
    ["bytes", "uint8", "uint16"],
    [masterKeySig, 2, threshold]
  );
  for (const recoveryEmail of recoveryEmails) {
    if (recoveryEmail[1] == null) {
      sig = solidityPack(
        ["bytes", "uint8", "bytes32"],
        [sig, 0, recoveryEmail[0]]
      );
    } else {
      sig = solidityPack(
        ["bytes", "uint8", "bytes32", "bytes"],
        [sig, 1, recoveryEmail[0], SerializeDkimParams(recoveryEmail[1])]
      );
    }
  }
  return sig;
}

describe("ModuleAuth", function () {
  let moduleAuth: Contract;
  let proxyModuleAuth: Contract;
  let factory: Contract;
  let masterKey: Wallet;
  let threshold: number;
  let recoveryEmails: string[];
  let keySet: string;
  this.beforeEach(async function () {
    recoveryEmails = [];
    let accounts = await ethers.getSigners();
    masterKey = Wallet.createRandom();

    let Factory = await ethers.getContractFactory("Factory");
    factory = await Factory.deploy();

    const DkimKeys = await ethers.getContractFactory("DkimKeys");
    const dkimKeys = await DkimKeys.deploy(accounts[0].address);

    const ModuleAuth = await ethers.getContractFactory("ModuleAuth");
    moduleAuth = await ModuleAuth.deploy(factory.address);
    threshold = 4;

    keySet = keccak256(
      ethers.utils.solidityPack(
        ["address", "uint16"],
        [masterKey.address, threshold]
      )
    );
    for (let i = 0; i < 10; i++) {
      const recoveryEmail =
        Wallet.createRandom().privateKey.substring(16) + "@mail.unipass.me";
      recoveryEmails.push(recoveryEmail);
      keySet = keccak256(
        ethers.utils.solidityPack(
          ["bytes32", "bytes32"],
          [keySet, emailHash(recoveryEmail)]
        )
      );
    }

    const ret = await (
      await factory.deploy(moduleAuth.address, keySet, dkimKeys.address)
    ).wait();
    expect(ret.status).to.equal(1);

    const code = ethers.utils.solidityPack(
      ["bytes", "uint256"],
      [
        "0x603a600e3d39601a805130553df3363d3d373d3d3d363d30545af43d82803e903d91601857fd5bf3",
        moduleAuth.address,
      ]
    );
    const codeHash = keccak256(code);
    const salt = keccak256(
      solidityPack(["bytes32", "address"], [keySet, dkimKeys.address])
    );
    const expectedAddress = getCreate2Address(factory.address, salt, codeHash);
    proxyModuleAuth = ModuleAuth.attach(expectedAddress);
  });

  it("Update KeySet By Master Key", async function () {
    const hash = Wallet.createRandom().privateKey;
    const sig = await generateSignature(
      proxyModuleAuth.address,
      ActionType.UpdateKeySet,
      1,
      undefined,
      hash,
      masterKey,
      threshold,
      recoveryEmails,
      SigType.SigMasterKey
    );
    const ret = await (
      await proxyModuleAuth.validateSignature(hash, sig)
    ).wait();
    expect(ret.status).to.equal(1);
    expect(await proxyModuleAuth.isPending()).to.true;
    expect(await proxyModuleAuth.newKeySet()).to.equal(hash);
  });
  it("Update KeySet By Recovery Email", async function () {
    const hash = Wallet.createRandom().privateKey;
    const sig = await generateSignature(
      proxyModuleAuth.address,
      ActionType.UpdateKeySet,
      1,
      undefined,
      hash,
      masterKey,
      threshold,
      recoveryEmails,
      SigType.SigRecoveryEmail
    );
    const ret = await (
      await proxyModuleAuth.validateSignature(hash, sig)
    ).wait();
    expect(ret.status).to.equal(1);
    expect(await proxyModuleAuth.isPending()).to.true;
    expect(await proxyModuleAuth.newKeySet()).to.equal(hash);
  });
  it("Update KeySet By Master Key And Recovery Email", async function () {
    const hash = Wallet.createRandom().privateKey;
    const sig = await generateSignature(
      proxyModuleAuth.address,
      ActionType.UpdateKeySet,
      1,
      undefined,
      hash,
      masterKey,
      threshold,
      recoveryEmails,
      SigType.SigMasterKeyWithRecoveryEmail
    );
    const ret = await (
      await proxyModuleAuth.validateSignature(hash, sig)
    ).wait();
    expect(ret.status).to.equal(1);
    expect(await proxyModuleAuth.isPending()).to.false;
    expect(await proxyModuleAuth.getKeySet()).to.equal(hash);
  });
  it("Update delays", async function () {
    const metaNonce = 2;
    const newDelay = 2;
    const hash = keccak256(
      solidityPack(
        ["uint32", "address", "uint32"],
        [metaNonce, proxyModuleAuth.address, newDelay]
      )
    );
    const sig = await generateSignature(
      proxyModuleAuth.address,
      ActionType.UpdateTimeLock,
      metaNonce,
      newDelay,
      undefined,
      masterKey,
      threshold,
      recoveryEmails,
      undefined
    );
    const ret = await (
      await proxyModuleAuth.validateSignature(hash, sig)
    ).wait();
    expect(ret.status).to.equal(1);
    expect(await proxyModuleAuth.isPending()).to.false;
    expect(await proxyModuleAuth.delay()).to.equal(newDelay);
  });
});
