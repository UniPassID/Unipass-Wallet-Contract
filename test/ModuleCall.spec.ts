import { expect } from "chai";
import {
  BigNumber,
  Contract,
  ContractFactory,
  Overrides,
  Wallet,
} from "ethers";
import { randomBytes } from "ethers/lib/utils";
import { ethers } from "hardhat";
import {
  generateRecoveryEmails,
  getKeysetHash,
  getProxyAddress,
  optimalGasLimit,
} from "./utils/common";
import { Deployer } from "./utils/deployer";
import {
  ActionType,
  CallType,
  executeCall,
  generateAccountLayerSignature,
  generateTransactionSig,
  generateTransferTx,
  generateUpdateKeysetHashTx,
  SigType,
} from "./utils/sigPart";

describe("ModuleCall", function () {
  let testModuleCall: Contract;
  let TestModuleCall: ContractFactory;
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

    const ModuleMainUpgradable = await ethers.getContractFactory(
      "ModuleMainUpgradable"
    );
    const moduleMainUpgradable = await deployer.deployContract(
      ModuleMainUpgradable,
      0,
      txParams,
      dkimKeys.address
    );

    TestModuleCall = await ethers.getContractFactory("TestModuleCall");
    testModuleCall = await deployer.deployContract(
      TestModuleCall,
      0,
      txParams,
      deployer.singleFactoryContract.address,
      moduleMainUpgradable.address,
      dkimKeys.address
    );

    chainId = (await dkimKeys.provider.getNetwork()).chainId;
  });
  this.beforeEach(async function () {
    threshold = 4;
    masterKey = Wallet.createRandom();

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
});
