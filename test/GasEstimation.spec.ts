import { expect } from "chai";
import { Contract, ContractFactory, Overrides, Wallet } from "ethers";
import { BytesLike, randomBytes } from "ethers/lib/utils";
import { ethers } from "hardhat";
import {
  generateRecoveryEmails,
  getKeysetHash,
  optimalGasLimit,
} from "./utils/common";
import { Deployer } from "./utils/deployer";
import {
  CallType,
  executeCall,
  generateTransactionSig,
  generateTransferTx,
  generateUpdateKeysetHashTx,
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
  let moduleMain: Contract;
  let ModuleMain: ContractFactory;
  let entryPoint: Contract;
  let moduleGuest: Contract;
  let proxyModuleMain: Contract;
  let gasEstimation: Contract;
  let deployer: Deployer;
  let dkimKeys: Contract;
  let masterKey: Wallet;
  let keysetHash: string;
  let threshold: number;
  let recoveryEmailIndexes: number[];
  let recoveryEmails: string[];
  let dkimKeysAdmin: Wallet;
  let txParams: Overrides;
  let metaNonce: number;
  let nonce: number;
  this.beforeAll(async function () {
    const [signer] = await ethers.getSigners();
    deployer = await new Deployer(signer).init();

    txParams = {
      gasLimit: 6000000,
      gasPrice: (await signer.provider?.getGasPrice())?.mul(12).div(10),
    };

    const DkimKeys = await ethers.getContractFactory("DkimKeys");
    dkimKeysAdmin = Wallet.createRandom();
    dkimKeys = await deployer.deployContract(
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
      10,
      10
    );

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

    ModuleMain = await ethers.getContractFactory("ModuleMain");
    moduleMain = await deployer.deployContract(
      ModuleMain,
      0,
      txParams,
      deployer.singleFactoryContract.address,
      moduleMainUpgradable.address,
      dkimKeys.address,
      entryPoint.address
    );

    const GasEstimation = await ethers.getContractFactory("GasEstimator");
    gasEstimation = await deployer.deployContract(GasEstimation, 0, txParams);

    const ModuleGuest = await ethers.getContractFactory("ModuleGuest");
    moduleGuest = await deployer.deployContract(ModuleGuest, 0, txParams);
  });
  this.beforeEach(async function () {
    threshold = 4;
    masterKey = Wallet.createRandom();

    recoveryEmailIndexes = [...Array(threshold).keys()].map((v) => v + 1);
    recoveryEmails = generateRecoveryEmails(10);
    keysetHash = getKeysetHash(masterKey.address, threshold, recoveryEmails);

    proxyModuleMain = await deployer.deployProxyContract(
      ModuleMain.interface,
      moduleMain.address,
      keysetHash,
      txParams
    );

    const txRet = await (
      await ethers.getSigners()
    )[0].sendTransaction({
      to: proxyModuleMain.address,
      value: ethers.utils.parseEther("100"),
    });
    expect((await txRet.wait()).status).to.equal(1);

    metaNonce = 1;
    nonce = 1;
  });

  it("Should estimate wallet deployement", async function () {
    const deployData =
      deployer.singleFactoryContract.interface.encodeFunctionData("deploy", [
        Deployer.getInitCode(moduleMain.address),
        randomBytes(32),
      ]);

    const estimate = await gasEstimation.callStatic.estimate(
      deployer.singleFactoryContract.address,
      deployData
    );
    const gasUsed: number = (
      await (
        await deployer.singleFactoryContract.deploy(
          Deployer.getInitCode(moduleMain.address),
          randomBytes(32)
        )
      ).wait()
    ).gasUsed.toNumber();

    expect(estimate.gas.toNumber() + txBaseCost(deployData)).to.approximately(
      gasUsed,
      5000
    );
  });
  it("Should estimate account transaction", async function () {
    const newKeysetHash = ethers.utils.hexlify(randomBytes(32));
    const tx = await generateUpdateKeysetHashTx(
      proxyModuleMain,
      metaNonce,
      newKeysetHash,
      masterKey,
      threshold,
      recoveryEmailIndexes,
      recoveryEmails,
      SigType.SigMasterKey
    );
    const nonce = 1;
    const { chainId } = await proxyModuleMain.provider.getNetwork();
    const feeToken = ethers.constants.AddressZero;
    const feeReceiver = ethers.constants.AddressZero;
    const feeAmount = 0;
    const sessionKey = Wallet.createRandom();
    const expired = Math.ceil(Date.now() / 1000) + 300;
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
      sessionKey,
      expired,
      SigType.SigSessionKey
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
    const realTx = await executeCall(
      [tx],
      chainId,
      nonce,
      masterKey,
      threshold,
      recoveryEmails,
      sessionKey,
      expired,
      proxyModuleMain,
      SigType.SigSessionKey
    );
    expect(estimate.gas.toNumber() + txBaseCost(txData)).to.approximately(
      realTx.gasUsed.toNumber(),
      5000
    );
  });
  it("Should estimate deploy + Account Layer Transaction + Transfer", async function () {
    threshold = 5;
    keysetHash = getKeysetHash(masterKey.address, threshold, recoveryEmails);
    const deployTxData =
      deployer.singleFactoryContract.interface.encodeFunctionData("deploy", [
        Deployer.getInitCode(moduleMain.address),
        keysetHash,
      ]);
    const deployTx = {
      callType: CallType.Call,
      gasLimit: optimalGasLimit,
      target: deployer.singleFactoryContract.address,
      value: 0,
      data: deployTxData,
    };
    const expectedAddress = deployer.getProxyContractAddress(
      moduleMain.address,
      keysetHash
    );
    const newKeysetHash = ethers.utils.hexValue(randomBytes(32));
    proxyModuleMain = ModuleMain.attach(expectedAddress);
    const accountTx = await generateUpdateKeysetHashTx(
      proxyModuleMain,
      metaNonce,
      newKeysetHash,
      masterKey,
      threshold,
      recoveryEmailIndexes,
      recoveryEmails,
      SigType.SigMasterKey
    );
    let value = ethers.utils.parseEther("0.1");
    const transferTx = await generateTransferTx(
      expectedAddress,
      ethers.constants.Zero,
      value
    );
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
    const ret = await proxyModuleMain.lockedKeysetHash();
    expect(ret).to.equal(newKeysetHash);
    expect(await proxyModuleMain.provider.getBalance(expectedAddress)).to.equal(
      value
    );
  });
});
