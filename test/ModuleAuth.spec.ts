import { expect } from "chai";
import { Contract, ContractFactory, Wallet } from "ethers";
import { ethers } from "hardhat";
import { emailHash } from "./utils/email";
import { getCreate2Address, Interface, keccak256, solidityPack } from "ethers/lib/utils";
import {
  ActionType,
  generateAccountLayerSignature,
  SigType,
} from "./utils/sigPart";
import {
  generateRecoveryEmails,
  getKeysetHash,
  getProxyAddress,
} from "./utils/common";

describe("ModuleAuth", function () {
  let moduleAuth: Contract;
  let proxyModuleAuth: Contract;
  let factory: Contract;
  let masterKey: Wallet;
  let threshold: number;
  let recoveryEmails: string[];
  let keysetHash: string;
  this.beforeEach(async function () {
    let accounts = await ethers.getSigners();
    masterKey = Wallet.createRandom();

    let Factory = await ethers.getContractFactory("Factory");
    factory = await Factory.deploy();

    const DkimKeys = await ethers.getContractFactory("DkimKeys");
    const dkimKeys = await DkimKeys.deploy(accounts[0].address);

    const ModuleAuth = await ethers.getContractFactory("ModuleAuth");
    moduleAuth = await ModuleAuth.deploy(factory.address);
    threshold = 4;

    recoveryEmails = generateRecoveryEmails(10);
    keysetHash = getKeysetHash(masterKey.address, threshold, recoveryEmails);

    const ret = await (
      await factory.deploy(moduleAuth.address, keysetHash, dkimKeys.address)
    ).wait();
    expect(ret.status).to.equal(1);

    const expectedAddress = getProxyAddress(
      moduleAuth.address,
      dkimKeys.address,
      factory.address,
      keysetHash
    );
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
    const ret = await (await proxyModuleAuth.executeAccountTx(sig)).wait();
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
    const ret = await (await proxyModuleAuth.executeAccountTx(sig)).wait();
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
    const ret = await (await proxyModuleAuth.executeAccountTx(sig)).wait();
    expect(ret.status).to.equal(1);
    expect(await proxyModuleAuth.isPending()).to.false;
    expect(await proxyModuleAuth.getKeysetHash()).to.equal(hash);
  });
  it("Update delays", async function () {
    const metaNonce = 2;
    const newDelay = 2;

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
    const ret = await (await proxyModuleAuth.executeAccountTx(sig)).wait();
    expect(ret.status).to.equal(1);
    expect(await proxyModuleAuth.isPending()).to.false;
    expect(await proxyModuleAuth.delay()).to.equal(newDelay);
  });
});
