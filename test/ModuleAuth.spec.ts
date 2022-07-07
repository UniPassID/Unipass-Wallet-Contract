import { expect } from "chai";
import { Contract, Wallet } from "ethers";
import { ethers } from "hardhat";
import { emailHash } from "./utils/email";
import { getCreate2Address, keccak256, solidityPack } from "ethers/lib/utils";
import {
  ActionType,
  generateAccountLayerSignature,
  SigType,
} from "./utils/sigPart";

describe("ModuleAuth", function () {
  let moduleAuth: Contract;
  let proxyModuleAuth: Contract;
  let factory: Contract;
  let masterKey: Wallet;
  let threshold: number;
  let recoveryEmails: string[];
  let keysetHash: string;
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

    keysetHash = keccak256(
      ethers.utils.solidityPack(
        ["address", "uint16"],
        [masterKey.address, threshold]
      )
    );
    for (let i = 0; i < 10; i++) {
      const recoveryEmail =
        Wallet.createRandom().privateKey.substring(16) + "@mail.unipass.me";
      recoveryEmails.push(recoveryEmail);
      keysetHash = keccak256(
        ethers.utils.solidityPack(
          ["bytes32", "bytes32"],
          [keysetHash, emailHash(recoveryEmail)]
        )
      );
    }

    const ret = await (
      await factory.deploy(moduleAuth.address, keysetHash, dkimKeys.address)
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
      solidityPack(["bytes32", "address"], [keysetHash, dkimKeys.address])
    );
    const expectedAddress = getCreate2Address(factory.address, salt, codeHash);
    proxyModuleAuth = ModuleAuth.attach(expectedAddress);
  });

  it("Update KeysetHash By Master Key", async function () {
    const hash = Wallet.createRandom().privateKey;
    const sig = await generateAccountLayerSignature(
      proxyModuleAuth.address,
      ActionType.UpdateKeysetHash,
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
    expect(await proxyModuleAuth.newKeysetHash()).to.equal(hash);
  });
  it("Update KeysetHash By Recovery Email", async function () {
    const hash = Wallet.createRandom().privateKey;
    const sig = await generateAccountLayerSignature(
      proxyModuleAuth.address,
      ActionType.UpdateKeysetHash,
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
    expect(await proxyModuleAuth.newKeysetHash()).to.equal(hash);
  });
  it("Update KeysetHash By Master Key And Recovery Email", async function () {
    const hash = Wallet.createRandom().privateKey;
    const sig = await generateAccountLayerSignature(
      proxyModuleAuth.address,
      ActionType.UpdateKeysetHash,
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
    expect(await proxyModuleAuth.getKeysetHash()).to.equal(hash);
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
    const sig = await generateAccountLayerSignature(
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
