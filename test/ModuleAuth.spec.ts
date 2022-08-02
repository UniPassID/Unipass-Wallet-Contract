import { expect } from "chai";
import { Contract, Overrides, Wallet } from "ethers";
import { ethers } from "hardhat";
import {
  ActionType,
  generateAccountLayerSignature,
  SigType,
} from "./utils/sigPart";
import {
  generateRecoveryEmails,
  getKeysetHash,
  PAYMASTER_STAKE,
  UNSTAKE_DELAY_SEC,
} from "./utils/common";
import { Deployer } from "./utils/deployer";
import { hexlify, randomBytes } from "ethers/lib/utils";

describe("ModuleAuth", function () {
  let entryPoint: Contract;
  let moduleAuthFixed: Contract;
  let moduleAuthUpgradable: Contract;
  let proxyModuleAuth: Contract;
  let deployer: Deployer;
  let masterKey: Wallet;
  let threshold: number;
  let recoveryEmails: string[];
  let keysetHash: string;
  let metaNonce: number;
  let txParams: Overrides;
  let dkimKeysAdmin: Wallet;
  let recoveryEmailsIndexes: number[];

  this.beforeEach(async function () {
    const [signer] = await ethers.getSigners();
    txParams = {
      gasLimit: 6000000,
      gasPrice: (await signer.getGasPrice()).mul(12).div(10),
    };
    masterKey = Wallet.createRandom();

    deployer = await new Deployer(signer).init();

    const DkimKeys = await ethers.getContractFactory("DkimKeys");
    dkimKeysAdmin = Wallet.createRandom();
    const dkimKeys = await deployer.deployContract(
      DkimKeys,
      0,
      txParams,
      dkimKeysAdmin.address
    );

    const EntryPoint = await ethers.getContractFactory("EntryPoint");
    entryPoint = await deployer.deployContract(
      EntryPoint,
      0,
      txParams,
      deployer.singleFactoryContract.address,
      PAYMASTER_STAKE,
      UNSTAKE_DELAY_SEC
    );

    const ModuleAuthUpgradable = await ethers.getContractFactory(
      "ModuleAuthUpgradable"
    );
    moduleAuthUpgradable = await deployer.deployContract(
      ModuleAuthUpgradable,
      0,
      txParams,
      dkimKeys.address,
      entryPoint.address
    );

    const ModuleAuthFixed = await ethers.getContractFactory("ModuleAuthFixed");
    moduleAuthFixed = await deployer.deployContract(
      ModuleAuthFixed,
      0,
      txParams,
      deployer.singleFactoryContract.address,
      moduleAuthUpgradable.address,
      dkimKeys.address,
      entryPoint.address
    );
    threshold = 4;

    recoveryEmailsIndexes = [...Array(threshold).keys()].map((v) => v + 1);
    recoveryEmails = generateRecoveryEmails(10);
    keysetHash = getKeysetHash(masterKey.address, threshold, recoveryEmails);

    proxyModuleAuth = await deployer.deployProxyContract(
      moduleAuthFixed.interface,
      moduleAuthFixed.address,
      keysetHash,
      txParams
    );
    metaNonce = 1;
  });
  describe("Test For ModuleAuthFixed And ModuleAuthUpgradable", () => {
    ["ModuleAuthFixed", "ModuleAuthUpgradable"].forEach(async (module) => {
      const init = async () => {
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
            recoveryEmailsIndexes,
            recoveryEmails,
            SigType.SigMasterKeyWithRecoveryEmail
          );
          const ret = await (
            await proxyModuleAuth.executeAccountTx(sig)
          ).wait();
          expect(ret.status).to.equals(1);
          metaNonce++;
          masterKey = newMasterKey;
          recoveryEmails = newRecoveryEmails;
          keysetHash = newKeysetHash;
        }
      };

      it(`Update KeysetHash By Single Master Key For ${module}`, async function () {
        await init();
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
          recoveryEmailsIndexes,
          recoveryEmails,
          SigType.SigMasterKey
        );
        const ret = await (await proxyModuleAuth.executeAccountTx(sig)).wait();
        expect(ret.status).to.equal(1);
        expect(await proxyModuleAuth.isLocked()).to.true;
        expect(await proxyModuleAuth.lockedKeysetHash()).to.equal(hash);
        metaNonce++;
      });
      it(`Update KeysetHash By Recovery Email For ${module}`, async function () {
        await init();
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
          recoveryEmailsIndexes,
          recoveryEmails,
          SigType.SigRecoveryEmail
        );
        const ret = await (await proxyModuleAuth.executeAccountTx(sig)).wait();
        expect(ret.status).to.equal(1);
        expect(await proxyModuleAuth.isLocked()).to.true;
        expect(await proxyModuleAuth.lockedKeysetHash()).to.equal(hash);
        metaNonce++;
      });
      it(`Update KeysetHash By Master Key And Recovery Email For ${module}`, async function () {
        await init();
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
          recoveryEmailsIndexes,
          recoveryEmails,
          SigType.SigMasterKeyWithRecoveryEmail
        );
        const ret = await (await proxyModuleAuth.executeAccountTx(sig)).wait();
        expect(ret.status).to.equal(1);
        expect(await proxyModuleAuth.isLocked()).to.false;
        expect(await proxyModuleAuth.getKeysetHash()).to.equal(hash);
        metaNonce++;
      });
      it(`UnLock KeysetHash TimeLock For ${module}`, async function () {
        await init();
        // Update Delay To 3
        const newDelay = 3;
        let sig = await generateAccountLayerSignature(
          proxyModuleAuth.address,
          ActionType.UpdateTimeLockDuring,
          metaNonce,
          newDelay,
          undefined,
          undefined,
          masterKey,
          threshold,
          recoveryEmailsIndexes,
          recoveryEmails,
          SigType.SigMasterKey
        );
        let ret = await (await proxyModuleAuth.executeAccountTx(sig)).wait();
        expect(ret.status).to.equal(1);
        expect(await proxyModuleAuth.isLocked()).to.false;
        expect(await proxyModuleAuth.getLockDuring()).to.equal(newDelay);
        metaNonce++;

        const newKeysetHash = hexlify(randomBytes(32));
        sig = await generateAccountLayerSignature(
          proxyModuleAuth.address,
          ActionType.UpdateKeysetHash,
          metaNonce,
          undefined,
          newKeysetHash,
          undefined,
          masterKey,
          threshold,
          recoveryEmailsIndexes,
          recoveryEmails,
          SigType.SigRecoveryEmail
        );
        ret = await (await proxyModuleAuth.executeAccountTx(sig)).wait();
        expect(ret.status).to.equal(1);
        expect(await proxyModuleAuth.isLocked()).to.true;
        expect(await proxyModuleAuth.lockedKeysetHash()).to.equal(
          newKeysetHash
        );
        expect(await proxyModuleAuth.getKeysetHash()).not.to.equal(
          newKeysetHash
        );
        metaNonce++;

        await new Promise((resolve) =>
          setTimeout(resolve, newDelay * 1000 + 1000)
        );
        sig = await generateAccountLayerSignature(
          proxyModuleAuth.address,
          ActionType.UnlockKeysetHash,
          metaNonce,
          undefined,
          newKeysetHash,
          undefined,
          masterKey,
          threshold,
          recoveryEmailsIndexes,
          recoveryEmails,
          SigType.SigRecoveryEmail
        );
        ret = await (await proxyModuleAuth.executeAccountTx(sig)).wait();
        expect(ret.status).to.equal(1);
        expect(await proxyModuleAuth.getKeysetHash()).to.equals(newKeysetHash);
        metaNonce++;
      });

      it(`Cancel KeysetHash TimeLock For ${module}`, async function () {
        await init();
        const newKeysetHash = hexlify(randomBytes(32));
        let sig = await generateAccountLayerSignature(
          proxyModuleAuth.address,
          ActionType.UpdateKeysetHash,
          metaNonce,
          undefined,
          newKeysetHash,
          undefined,
          masterKey,
          threshold,
          recoveryEmailsIndexes,
          recoveryEmails,
          SigType.SigRecoveryEmail
        );
        let ret = await (await proxyModuleAuth.executeAccountTx(sig)).wait();
        expect(ret.status).to.equal(1);
        expect(await proxyModuleAuth.isLocked()).to.true;
        expect(await proxyModuleAuth.lockedKeysetHash()).to.equal(
          newKeysetHash
        );
        expect(await proxyModuleAuth.getKeysetHash()).not.to.equal(
          newKeysetHash
        );
        metaNonce++;

        sig = await generateAccountLayerSignature(
          proxyModuleAuth.address,
          ActionType.CancelLockKeysetHash,
          metaNonce,
          undefined,
          undefined,
          undefined,
          masterKey,
          threshold,
          recoveryEmailsIndexes,
          recoveryEmails,
          SigType.SigMasterKey
        );
        ret = await (await proxyModuleAuth.executeAccountTx(sig)).wait();
        expect(ret.status).to.equal(1);
        expect(await proxyModuleAuth.isLocked()).to.false;
        expect(await proxyModuleAuth.getMetaNonce()).to.equals(metaNonce);
        metaNonce++;
      });
      it(`Update TimeLock LockDuring For ${module}`, async function () {
        await init();
        const newDelay = 2;

        const sig = await generateAccountLayerSignature(
          proxyModuleAuth.address,
          ActionType.UpdateTimeLockDuring,
          metaNonce,
          newDelay,
          undefined,
          undefined,
          masterKey,
          threshold,
          recoveryEmailsIndexes,
          recoveryEmails,
          SigType.SigMasterKey
        );
        const ret = await (await proxyModuleAuth.executeAccountTx(sig)).wait();
        expect(ret.status).to.equal(1);
        expect(await proxyModuleAuth.isLocked()).to.false;
        expect(await proxyModuleAuth.getLockDuring()).to.equal(newDelay);
        metaNonce++;
      });
      it(`Update Implementation For ${module}`, async function () {
        await init();
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
          recoveryEmailsIndexes,
          recoveryEmails,
          undefined
        );
        const ret = await (await proxyModuleAuth.executeAccountTx(sig)).wait();
        expect(ret.status).to.equal(1);
        proxyModuleAuth = Greeter.attach(proxyModuleAuth.address);
        expect(await proxyModuleAuth.ret1()).to.equals(1);
        metaNonce++;
      });

      it(`Update EntryPoint For ${module}`, async function () {
        await init();
        const Greeter = await ethers.getContractFactory("Greeter");
        const greeter = await Greeter.deploy();

        const sig = await generateAccountLayerSignature(
          proxyModuleAuth.address,
          ActionType.UpdateEntryPoint,
          metaNonce,
          undefined,
          undefined,
          greeter.address,
          masterKey,
          threshold,
          recoveryEmailsIndexes,
          recoveryEmails,
          undefined
        );
        const ret = await (await proxyModuleAuth.executeAccountTx(sig)).wait();
        expect(ret.status).to.equal(1);
        expect(await proxyModuleAuth.getEntryPoint()).to.equals(
          greeter.address
        );
        metaNonce++;
      });

      it(`Update EntryPoint For ${module}`, async function () {
        await init();
        const Greeter = await ethers.getContractFactory("Greeter");
        const greeter = await Greeter.deploy();

        const sig = await generateAccountLayerSignature(
          proxyModuleAuth.address,
          ActionType.UpdateEntryPoint,
          metaNonce,
          undefined,
          undefined,
          greeter.address,
          masterKey,
          threshold,
          recoveryEmailsIndexes,
          recoveryEmails,
          undefined
        );
        const ret = await (await proxyModuleAuth.executeAccountTx(sig)).wait();
        expect(ret.status).to.equal(1);
        expect(await proxyModuleAuth.getEntryPoint()).to.equals(
          greeter.address
        );
        metaNonce++;
      });
    });
  });
});
