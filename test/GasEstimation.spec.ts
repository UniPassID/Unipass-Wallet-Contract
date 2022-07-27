import { deploy } from "@openzeppelin/hardhat-upgrades/dist/utils";
import { expect } from "chai";
import { BigNumber, Contract, ContractFactory, Wallet } from "ethers";
import { BytesLike, randomBytes } from "ethers/lib/utils";
import { ethers } from "hardhat";
import {
  generateRecoveryEmails,
  getKeysetHash,
  getProxyAddress,
  optimalGasLimit,
} from "./utils/common";
import { emailHash } from "./utils/email";
import {
  ActionType,
  CallType,
  generateAccountLayerSignature,
  generateTransactionSig,
  SigType,
} from "./utils/sigPart";

function txBaseCost(data: BytesLike): number {
  const bytes = ethers.utils.arrayify(data);
  return bytes
    .reduce((p, c) => (c == 0 ? p.add(4) : p.add(16)), ethers.constants.Zero)
    .add(21000)
    .toNumber();
}

describe("GasEstimation", function () {
  // let moduleMainGasEstimation: Contract;
  // let ModuleMainGasEstimation: ContractFactory;
  let moduleMain: Contract;
  let ModuleMain: ContractFactory;
  let moduleGuest: Contract;
  let proxyModuleMain: Contract;
  let gasEstimation: Contract;
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

    const DkimKeys = await ethers.getContractFactory("DkimKeys");
    dkimKeysAdmin = Wallet.createRandom();
    dkimKeys = await DkimKeys.deploy(dkimKeysAdmin.address);

    const ModuleMainUpgradable = await ethers.getContractFactory(
      "ModuleMainUpgradable"
    );
    const moduleMainUpgradable = await ModuleMainUpgradable.deploy(
      dkimKeys.address
    );

    ModuleMain = await ethers.getContractFactory("ModuleMain");
    moduleMain = await ModuleMain.deploy(
      factory.address,
      moduleMainUpgradable.address,
      dkimKeys.address
    );

    const GasEstimation = await ethers.getContractFactory("GasEstimator");
    gasEstimation = await GasEstimation.deploy();

    const ModuleGuest = await ethers.getContractFactory("ModuleGuest");
    moduleGuest = await ModuleGuest.deploy();
  });
  this.beforeEach(async function () {
    threshold = 4;
    masterKey = Wallet.createRandom();

    recoveryEmails = generateRecoveryEmails(10);
    keysetHash = getKeysetHash(masterKey.address, threshold, recoveryEmails);

    const ret = await (
      await factory.deploy(moduleMain.address, keysetHash)
    ).wait();
    expect(ret.status).to.equal(1);

    const expectedAddress = getProxyAddress(
      moduleMain.address,
      factory.address,
      keysetHash
    );
    proxyModuleMain = moduleMain.attach(expectedAddress);
    const txRet = await (
      await ethers.getSigners()
    )[0].sendTransaction({
      to: proxyModuleMain.address,
      value: ethers.utils.parseEther("100"),
    });
    expect((await txRet.wait()).status).to.equal(1);
  });

  it("Should estimate wallet deployement", async function () {
    const deployData = factory.interface.encodeFunctionData("deploy", [
      moduleMain.address,
      randomBytes(32),
    ]);
    const gasUsed: number = (
      await (await factory.deploy(moduleMain.address, randomBytes(32))).wait()
    ).gasUsed.toNumber();
    const estimate = await gasEstimation.callStatic.estimate(
      factory.address,
      deployData
    );

    expect(estimate.gas.toNumber() + txBaseCost(deployData)).to.approximately(
      gasUsed,
      5000
    );
  });
  it("Should estimate account transaction", async function () {
    const newKeysetHash = ethers.utils.hexValue(randomBytes(32));
    const data = await generateAccountLayerSignature(
      proxyModuleMain.address,
      ActionType.UpdateKeysetHash,
      1,
      undefined,
      newKeysetHash,
      undefined,
      masterKey,
      threshold,
      recoveryEmails,
      SigType.SigMasterKey
    );
    const value = ethers.constants.Zero;
    let tx = {
      callType: CallType.CallAccountLayer,
      gasLimit: optimalGasLimit,
      target: ethers.constants.AddressZero,
      value,
      data,
    };
    const nonce = 1;
    const { chainId } = await proxyModuleMain.provider.getNetwork();
    const feeToken = ethers.constants.AddressZero;
    const feeReceiver = ethers.constants.AddressZero;
    const feeAmount = 0;
    const signature = await generateTransactionSig(
      chainId,
      [tx],
      nonce,
      feeToken,
      feeAmount,
      masterKey,
      threshold,
      recoveryEmails,
      [...Array(threshold).keys()].map((v) => v + 1),
      undefined,
      undefined,
      SigType.SigNone
    );
    const txData = proxyModuleMain.interface.encodeFunctionData("execute", [
      [tx],
      nonce,
      feeToken,
      feeReceiver,
      0,
      signature,
    ]);
    const estimate = await gasEstimation.callStatic.estimate(
      proxyModuleMain.address,
      txData
    );
    const realTx = await (
      await proxyModuleMain.execute(
        [tx],
        nonce,
        feeToken,
        feeReceiver,
        0,
        signature
      )
    ).wait();
    expect(estimate.gas.toNumber() + txBaseCost(txData)).to.approximately(
      realTx.gasUsed.toNumber(),
      5000
    );
  });
  it("Should estimate deploy + Account Layer Transaction + Transfer", async function () {
    threshold = 5;
    keysetHash = getKeysetHash(masterKey.address, threshold, recoveryEmails);
    const deployTxData = factory.interface.encodeFunctionData("deploy", [
      moduleMain.address,
      keysetHash,
    ]);
    const deployTx = {
      callType: CallType.Call,
      gasLimit: optimalGasLimit,
      target: factory.address,
      value: 0,
      data: deployTxData,
    };
    const expectedAddress = getProxyAddress(
      moduleMain.address,
      factory.address,
      keysetHash
    );
    const newKeysetHash = ethers.utils.hexValue(randomBytes(32));
    const data = await generateAccountLayerSignature(
      expectedAddress,
      ActionType.UpdateKeysetHash,
      1,
      undefined,
      newKeysetHash,
      undefined,
      masterKey,
      threshold,
      recoveryEmails,
      SigType.SigMasterKey
    );
    let accountTx = {
      callType: CallType.CallAccountLayer,
      gasLimit: optimalGasLimit,
      target: expectedAddress,
      value: ethers.constants.Zero,
      data,
    };
    let value = 20;
    let transferTx = {
      callType: CallType.Call,
      gasLimit: optimalGasLimit,
      target: expectedAddress,
      value: BigNumber.from(value),
      data: "0x",
    };
    const nonce = 1;
    const { chainId } = await moduleGuest.provider.getNetwork();
    const feeToken = ethers.constants.AddressZero;
    const feeReceiver = ethers.constants.AddressZero;
    const feeAmount = 0;
    const signature = await generateTransactionSig(
      chainId,
      [accountTx],
      nonce,
      feeToken,
      feeAmount,
      masterKey,
      threshold,
      recoveryEmails,
      [...Array(threshold).keys()].map((v) => v + 1),
      undefined,
      undefined,
      SigType.SigNone
    );
    const moduleMainTxData = moduleMain.interface.encodeFunctionData(
      "execute",
      [[accountTx], nonce, feeToken, feeReceiver, 0, signature]
    );
    const moduleMainTx = {
      target: expectedAddress,
      callType: CallType.Call,
      gasLimit: 0,
      value: 0,
      data: moduleMainTxData,
    };

    const moduleGuestTxData = moduleGuest.interface.encodeFunctionData(
      "execute",
      [
        [deployTx, moduleMainTx, transferTx],
        nonce,
        ethers.constants.AddressZero,
        ethers.constants.AddressZero,
        0,
        "0x",
      ]
    );
    const estimate = await gasEstimation.callStatic.estimate(
      moduleGuest.address,
      moduleGuestTxData
    );
    const realTx = await (
      await moduleGuest.execute(
        [deployTx, moduleMainTx, transferTx],
        nonce,
        feeToken,
        feeReceiver,
        0,
        signature,
        { value }
      )
    ).wait();
    expect(
      estimate.gas.toNumber() + txBaseCost(moduleGuestTxData)
    ).to.approximately(realTx.gasUsed.toNumber(), 5000);
    proxyModuleMain = ModuleMain.attach(expectedAddress);
    const ret = await proxyModuleMain.getKeysetHash();
    expect(ret).to.equal(newKeysetHash);
    expect(await proxyModuleMain.provider.getBalance(expectedAddress)).to.equal(
      value
    );
  });
});
