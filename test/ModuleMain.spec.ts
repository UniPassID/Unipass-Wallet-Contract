import { expect } from "chai";
import { Contract, ContractFactory, Wallet } from "ethers";
import { ethers } from "hardhat";
import {
  generateRecoveryEmails,
  getKeysetHash,
  getProxyAddress,
  optimalGasLimit,
} from "./utils/common";
import {
  CallType,
  generateSessionKey,
  generateTransactionSig,
  SigType,
} from "./utils/sigPart";

describe("ModuleMain", function () {
  let moduleMain: Contract;
  let ModuleMain: ContractFactory;
  let proxyModuleMain: Contract;
  let factory: Contract;
  let dkimKeys: Contract;
  let masterKey: Wallet;
  let keysetHash: string;
  let threshold: number;
  let recoveryEmails: string[];
  let dkimKeysAdmin: Wallet;
  this.beforeAll(async function () {
    const Factory = await ethers.getContractFactory("Factory");
    factory = await Factory.deploy();
    ModuleMain = await ethers.getContractFactory("ModuleMain");
    moduleMain = await ModuleMain.deploy(factory.address);

    const DkimKeys = await ethers.getContractFactory("DkimKeys");
    dkimKeysAdmin = Wallet.createRandom();
    dkimKeys = await DkimKeys.deploy(dkimKeysAdmin.address);
  });
  this.beforeEach(async function () {
    threshold = 4;
    masterKey = Wallet.createRandom();

    recoveryEmails = generateRecoveryEmails(10);
    keysetHash = getKeysetHash(masterKey.address, threshold, recoveryEmails);

    const ret = await (
      await factory.deploy(moduleMain.address, keysetHash, dkimKeys.address)
    ).wait();
    expect(ret.status).to.equal(1);

    const expectedAddress = getProxyAddress(
      moduleMain.address,
      dkimKeys.address,
      factory.address,
      keysetHash
    );
    proxyModuleMain = ModuleMain.attach(expectedAddress);
    const txRet = await (
      await ethers.getSigners()
    )[0].sendTransaction({
      to: proxyModuleMain.address,
      value: ethers.utils.parseEther("100"),
    });
    expect((await txRet.wait()).status).to.equal(1);
  });
  describe("Test User Register", async () => {
    let masterKey: Wallet;
    let recoveryEmails: string[];
    let threshold: number;
    let userAddress: string;
    let keysetHash: string;
    it("User Not Registered", async () => {
      masterKey = Wallet.createRandom();
      threshold = 5;

      recoveryEmails = generateRecoveryEmails(10);
      keysetHash = getKeysetHash(masterKey.address, threshold, recoveryEmails);

      userAddress = getProxyAddress(
        moduleMain.address,
        dkimKeys.address,
        factory.address,
        keysetHash
      );

      const code = await moduleMain.provider.getCode(userAddress);
      expect(code).to.equal("0x");
    });

    it("User Registered", async () => {
      const recipt = await (
        await factory.deploy(moduleMain.address, keysetHash, dkimKeys.address)
      ).wait();
      expect(recipt.status).to.equal(1);
      const code = await moduleMain.provider.getCode(userAddress);
      expect(code).to.not.equal("0x");
    });
  });
  it("Test Get KeysetHash", async () => {
    const currentKeysetHash = await proxyModuleMain.getKeysetHash();
    expect(currentKeysetHash).to.equal(keysetHash);
  });
  it("Test Validating Permit", async () => {
    const sessionKey = Wallet.createRandom();
    const expired = Math.ceil(Date.now() / 1000 + 300);
    const digestHash = Wallet.createRandom().privateKey;
    const permit = await generateSessionKey(
      masterKey,
      threshold,
      recoveryEmails,
      digestHash,
      sessionKey,
      expired
    );
    const ret = await proxyModuleMain.isValidSignature(
      SigType.SigSessionKey,
      digestHash,
      permit,
      0
    );
    expect(ret).to.be.true;
  });
  it("Test Transfer", async () => {
    const nonce = (await proxyModuleMain.getNonce()) + 1;
    const { chainId } = await proxyModuleMain.provider.getNetwork();
    const feeToken = Wallet.createRandom().address;
    const feeReceiver = Wallet.createRandom().address;
    const feeAmount = 0;
    const sessionKey = Wallet.createRandom();
    const expired = Math.ceil(Date.now() / 1000 + 300);

    const to1 = Wallet.createRandom();
    const to2 = Wallet.createRandom();
    const value1 = 10;
    const value2 = 20;
    const tx1 = {
      callType: CallType.Call,
      gasLimit: optimalGasLimit,
      target: to1.address,
      value: value1,
      data: "0x",
    };
    const tx2 = {
      callType: CallType.Call,
      gasLimit: optimalGasLimit,
      target: to2.address,
      value: value2,
      data: "0x",
    };

    const signature = generateTransactionSig(
      chainId,
      [tx1, tx2],
      nonce,
      feeToken,
      feeAmount,
      masterKey,
      threshold,
      recoveryEmails,
      [...Array(threshold).keys()].map((v) => v + 1),
      sessionKey,
      expired,
      SigType.SigSessionKey
    );

    const recipt = await (
      await proxyModuleMain.execute(
        [tx1, tx2],
        nonce,
        feeToken,
        feeReceiver,
        0,
        signature
      )
    ).wait();
    expect(recipt.status).to.equal(1);
    expect(await proxyModuleMain.provider.getBalance(to1.address)).equal(
      value1
    );
    expect(await proxyModuleMain.provider.getBalance(to2.address)).equal(
      value2
    );
    expect(await proxyModuleMain.getNonce()).to.equal(nonce);
  });
});
