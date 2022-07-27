import { expect } from "chai";
import { Contract, Wallet } from "ethers";
import { ethers } from "hardhat";
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
  let moduleAuthFixed: Contract;
  let moduleAuthUpgradable: Contract;
  let proxyModuleAuth: Contract;
  let factory: Contract;
  let masterKey: Wallet;
  let threshold: number;
  let recoveryEmails: string[];
  let keysetHash: string;
  let chainId: number;
  let nonce: number;
  let metaNonce: number;
  this.beforeAll(async () => {
    chainId = (await ethers.provider.getNetwork()).chainId;
  });
  this.beforeEach(async function () {
    let accounts = await ethers.getSigners();
    masterKey = Wallet.createRandom();

    let Factory = await ethers.getContractFactory("Factory");
    factory = await Factory.deploy();

    const DkimKeys = await ethers.getContractFactory("DkimKeys");
    const dkimKeys = await DkimKeys.deploy(accounts[0].address);

    const ModuleAuthUpgradable = await ethers.getContractFactory(
      "ModuleAuthUpgradable"
    );
    moduleAuthUpgradable = await ModuleAuthUpgradable.deploy(dkimKeys.address);

    const ModuleAuthFixed = await ethers.getContractFactory("ModuleAuthFixed");
    moduleAuthFixed = await ModuleAuthFixed.deploy(
      factory.address,
      moduleAuthUpgradable.address,
      dkimKeys.address
    );
    threshold = 4;

    recoveryEmails = generateRecoveryEmails(10);
    keysetHash = getKeysetHash(masterKey.address, threshold, recoveryEmails);

    const ret = await (
      await factory.deploy(moduleAuthFixed.address, keysetHash)
    ).wait();
    expect(ret.status).to.equal(1);

    const expectedAddress = getProxyAddress(
      moduleAuthFixed.address,
      factory.address,
      keysetHash
    );
    proxyModuleAuth = ModuleAuthFixed.attach(expectedAddress);
    nonce = 1;
    metaNonce = 1;
  });
  it("Test For ModuleAuthFixed Adn ModuleAuthUpgradable", async () => {
    for (const module of ["ModuleAuthFixed", "ModuleAuthUpgradable"]) {
      if (module === "ModuleAuthUpgradable") {
        const newMasterKey = Wallet.createRandom();
        const newRecoveryEmails = generateRecoveryEmails(10);
        const newKeysetHash = getKeysetHash(
          newMasterKey.address,
          threshold,
          newRecoveryEmails
        );
        const sig = await generateAccountLayerSignature(
          proxyModuleAuth.address,
          ActionType.UpdateKeysetHash,
          metaNonce,
          undefined,
          newKeysetHash,
          undefined,
          masterKey,
          threshold,
          recoveryEmails,
          SigType.SigMasterKeyWithRecoveryEmail
        );
        const ret = await (await proxyModuleAuth.executeAccountTx(sig)).wait();
        expect(ret.status).to.equals(1);
        nonce++;
        metaNonce++;
        masterKey = newMasterKey;
        recoveryEmails = newRecoveryEmails;
        keysetHash = newKeysetHash;
      }

      it(`Update KeysetHash By Single Master Key For ${module}`, async function () {
        const hash = Wallet.createRandom().privateKey;
        const sig = await generateAccountLayerSignature(
          proxyModuleAuth.address,
          ActionType.UpdateKeysetHash,
          metaNonce,
          undefined,
          hash,
          undefined,
          masterKey,
          threshold,
          recoveryEmails,
          SigType.SigMasterKey
        );
        const ret = await (await proxyModuleAuth.executeAccountTx(sig)).wait();
        expect(ret.status).to.equal(1);
        expect(await proxyModuleAuth.isPending()).to.false;
        expect(await proxyModuleAuth.getKeysetHash()).to.equal(hash);
        metaNonce++;
        nonce++;
      });
      it(`Update KeysetHash By Recovery Email For ${module}`, async function () {
        const hash = Wallet.createRandom().privateKey;
        const sig = await generateAccountLayerSignature(
          proxyModuleAuth.address,
          ActionType.UpdateKeysetHash,
          metaNonce,
          undefined,
          hash,
          undefined,
          masterKey,
          threshold,
          recoveryEmails,
          SigType.SigRecoveryEmail
        );
        const ret = await (await proxyModuleAuth.executeAccountTx(sig)).wait();
        expect(ret.status).to.equal(1);
        expect(await proxyModuleAuth.isPending()).to.false;
        expect(await proxyModuleAuth.getKeysetHash()).to.equal(hash);
        nonce++;
        metaNonce++;
      });
      it(`Update KeysetHash By Master Key And Recovery Email For ${module}`, async function () {
        const hash = Wallet.createRandom().privateKey;
        const sig = await generateAccountLayerSignature(
          proxyModuleAuth.address,
          ActionType.UpdateKeysetHash,
          metaNonce,
          undefined,
          hash,
          undefined,
          masterKey,
          threshold,
          recoveryEmails,
          SigType.SigMasterKeyWithRecoveryEmail
        );
        const ret = await (await proxyModuleAuth.executeAccountTx(sig)).wait();
        expect(ret.status).to.equal(1);
        expect(await proxyModuleAuth.isPending()).to.false;
        expect(await proxyModuleAuth.getKeysetHash()).to.equal(hash);
        metaNonce++;
        nonce++;
      });
      it(`Update delays For ${module}`, async function () {
        const newDelay = 2;

        const sig = await generateAccountLayerSignature(
          proxyModuleAuth.address,
          ActionType.UpdateTimeLock,
          metaNonce,
          newDelay,
          undefined,
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
        metaNonce++;
        nonce++;
      });
      it(`Update Implementation For ${module}`, async function () {
        const newDelay = 2;
        const Greeter = await ethers.getContractFactory("Greeter");
        const greeter = await Greeter.deploy();

        const sig = await generateAccountLayerSignature(
          proxyModuleAuth.address,
          ActionType.UpdateImplementation,
          metaNonce,
          undefined,
          undefined,
          greeter.address,
          masterKey,
          threshold,
          recoveryEmails,
          undefined
        );
        const ret = await (await proxyModuleAuth.executeAccountTx(sig)).wait();
        expect(ret.status).to.equal(1);
        expect(await proxyModuleAuth.isPending()).to.false;
        expect(await proxyModuleAuth.getImplementation()).to.equal(
          greeter.address
        );
        expect(await proxyModuleAuth.ret()).to.equals(1);
        metaNonce++;
        nonce++;
      });
    }
  });
});
