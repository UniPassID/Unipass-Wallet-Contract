import { expect } from "chai";
import {
  BigNumber,
  constants,
  Contract,
  ContractFactory,
  Overrides,
  utils,
  Wallet,
} from "ethers";
import { hexlify, randomBytes } from "ethers/lib/utils";
import { ethers } from "hardhat";
import {
  generateRecoveryEmails,
  getKeysetHash,
  optimalGasLimit,
  PAYMASTER_STAKE,
  transferEth,
  UNSTAKE_DELAY_SEC,
} from "./utils/common";
import { Deployer } from "./utils/deployer";
import {
  executeCall,
  generateSignature,
  generateTransferTx,
  generateUpdateKeysetHashTx,
  SigType,
} from "./utils/sigPart";
import { DefaultsForUserOp, UserOperation } from "./utils/userOperation";

describe("ModuleCall", function () {
  let testModuleCall: Contract;
  let TestModuleCall: ContractFactory;
  let entryPoint: Wallet;
  let proxyTestModuleCall: Contract;
  let deployer: Deployer;
  let dkimKeys: Contract;
  let masterKey: Wallet;
  let keysetHash: string;
  let threshold: number;
  let recoveryEmails: string[];
  let wallet: Wallet;
  let chainId: number;
  let txParams: Overrides;
  let recoveryEmailsIndexes: number[];
  this.beforeAll(async function () {
    const [signer] = await ethers.getSigners();
    deployer = await new Deployer(signer).init();

    txParams = {
      gasLimit: 6000000,
      gasPrice: (await signer.provider?.getGasPrice())?.mul(12).div(10),
    };

    const DkimKeys = await ethers.getContractFactory("DkimKeys");
    wallet = Wallet.createRandom();
    dkimKeys = await deployer.deployContract(
      DkimKeys,
      0,
      txParams,
      wallet.address
    );

    entryPoint = Wallet.createRandom().connect(dkimKeys.provider);
    await transferEth(entryPoint.address, 10);

    const ModuleMainUpgradable = await ethers.getContractFactory(
      "ModuleMainUpgradable"
    );
    const moduleMainUpgradable = await deployer.deployContract(
      ModuleMainUpgradable,
      0,
      txParams,
      dkimKeys.address,
      entryPoint.address
    );

    TestModuleCall = await ethers.getContractFactory("TestModuleCall");
    testModuleCall = await deployer.deployContract(
      TestModuleCall,
      0,
      txParams,
      deployer.singleFactoryContract.address,
      moduleMainUpgradable.address,
      dkimKeys.address,
      entryPoint.address
    );

    chainId = (await dkimKeys.provider.getNetwork()).chainId;
  });
  this.beforeEach(async function () {
    threshold = 4;
    masterKey = Wallet.createRandom();

    recoveryEmailsIndexes = [...Array(threshold).keys()].map((v) => v + 1);
    recoveryEmails = generateRecoveryEmails(10);
    keysetHash = getKeysetHash(masterKey.address, threshold, recoveryEmails);

    proxyTestModuleCall = await deployer.deployProxyContract(
      TestModuleCall.interface,
      testModuleCall.address,
      keysetHash,
      txParams
    );
    const txRet = await (
      await ethers.getSigners()
    )[0].sendTransaction({
      to: proxyTestModuleCall.address,
      value: ethers.utils.parseEther("100"),
    });
    expect((await txRet.wait()).status).to.equal(1);
  });
  it("Test A Transfer Transaction", async function () {
    const to = Wallet.createRandom();
    const value = ethers.utils.parseEther("10");
    let tx = await generateTransferTx(to.address, optimalGasLimit, value);
    const nonce = 1;
    const sessionKey = Wallet.createRandom();

    const ret = await executeCall(
      [tx],
      chainId,
      nonce,
      masterKey,
      threshold,
      recoveryEmails,
      sessionKey,
      Math.ceil(Date.now() / 1000) + 1000,
      proxyTestModuleCall
    );
    expect(ret.status).to.equal(1);
    expect(await proxyTestModuleCall.provider.getBalance(to.address)).equal(
      value
    );
  });
  it("Test A Account Layer Transaction", async function () {
    const newKeysetHash = Wallet.createRandom().privateKey;
    const tx = await generateUpdateKeysetHashTx(
      proxyTestModuleCall.address,
      newKeysetHash,
      masterKey,
      threshold,
      recoveryEmails,
      SigType.SigMasterKey
    );

    const nonce = 1;
    const ret = await executeCall(
      [tx],
      chainId,
      nonce,
      masterKey,
      threshold,
      recoveryEmails,
      Wallet.createRandom(),
      Math.ceil(Date.now() / 1000) + 300,
      proxyTestModuleCall
    );
    expect(ret.status).to.equal(1);
    expect(await proxyTestModuleCall.lockedKeysetHash()).to.equal(
      newKeysetHash
    );
  });
  it("Test Multiple Transactions", async function () {
    const to = Wallet.createRandom();
    const value = ethers.utils.parseEther("10");
    const newKeysetHash = `0x${Buffer.from(randomBytes(32)).toString("hex")}`;
    const tx1 = await generateUpdateKeysetHashTx(
      proxyTestModuleCall.address,
      newKeysetHash,
      masterKey,
      threshold,
      recoveryEmails,
      SigType.SigMasterKey
    );
    const tx2 = await generateTransferTx(
      to.address,
      ethers.constants.Zero,
      value
    );

    const nonce = 1;
    const sessionKey = Wallet.createRandom();

    const ret = await executeCall(
      [tx1, tx2],
      chainId,
      nonce,
      masterKey,
      threshold,
      recoveryEmails,
      sessionKey,
      Math.ceil(Date.now() / 1000) + 300,
      proxyTestModuleCall
    );

    expect(ret.status).to.equal(1);
    expect(await proxyTestModuleCall.provider.getBalance(to.address)).equal(
      value
    );
    expect(await proxyTestModuleCall.lockedKeysetHash()).to.equal(
      newKeysetHash
    );
  });
  it("Execute From EntryPoint Should Success", async function () {
    const to = Wallet.createRandom();
    const value = ethers.utils.parseEther("10");
    let tx = await generateTransferTx(to.address, optimalGasLimit, value);
    const ret = await (
      await proxyTestModuleCall.connect(entryPoint).execFromEntryPoint(tx, 1)
    ).wait();
    expect(ret.status).to.equals(1);
    expect(await proxyTestModuleCall.provider.getBalance(to.address)).to.equals(
      ethers.utils.parseEther("10")
    );
    expect(await proxyTestModuleCall.getNonce()).to.equals(0);
  });
  it("Validate User Op Should Success", async function () {
    const to = Wallet.createRandom();
    const value = ethers.utils.parseEther("10");
    let op: UserOperation = DefaultsForUserOp;
    let tx = await generateTransferTx(to.address, optimalGasLimit, value);
    const requestId = hexlify(randomBytes(32));
    const sessionKey = Wallet.createRandom();
    const expired = Math.ceil(Date.now() / 1000) + 300;
    op.callData = proxyTestModuleCall.interface.encodeFunctionData(
      "execFromEntryPoint",
      [tx, 1]
    );
    op.sender = proxyTestModuleCall.address;
    op.signature = await generateSignature(
      SigType.SigSessionKey,
      requestId,
      sessionKey,
      expired,
      masterKey,
      threshold,
      recoveryEmailsIndexes,
      recoveryEmails
    );
    op.nonce = 1;
    const ret = await (
      await proxyTestModuleCall
        .connect(entryPoint)
        .validateUserOp(op, requestId, 0)
    ).wait();
    expect(ret.status).to.equals(1);
    expect(await proxyTestModuleCall.getNonce()).to.equals(1);
  });
});
