import { expect } from "chai";
import { Contract, ContractFactory, Overrides, Wallet } from "ethers";
import { BytesLike, randomBytes, solidityPack } from "ethers/lib/utils";
import { ethers } from "hardhat";
import NodeRSA from "node-rsa";
import { getKeysetHash, GUARDIAN_TIMELOCK_THRESHOLD, optimalGasLimit, OWNER_THRESHOLD, transferEth } from "./utils/common";
import { Deployer } from "./utils/deployer";
import { KeyBase, randomKeys, selectKeys } from "./utils/key";
import {
  CallType,
  executeCall,
  generateTransactionSig,
  generateTransferTx,
  generateUpdateKeysetHashTx,
  Role,
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
  let moduleGuest: Contract;
  let proxyModuleMain: Contract;
  let gasEstimation: Contract;
  let deployer: Deployer;
  let dkimKeys: Contract;
  let keys: KeyBase[];
  let keysetHash: string;
  let dkimKeysAdmin: Wallet;
  let txParams: Overrides;
  let metaNonce: number;
  let nonce: number;
  let unipassPrivateKey: string;
  let testERC1271Wallet: [Contract, Wallet][] = [];
  let Greeter: ContractFactory;
  let greeter1: Contract;
  let greeter2: Contract;
  this.beforeAll(async function () {
    const [signer] = await ethers.getSigners();
    deployer = await new Deployer(signer).init();

    txParams = {
      gasLimit: 10000000,
      gasPrice: (await signer.provider?.getGasPrice())?.mul(12).div(10),
    };

    const TestERC1271Wallet = await ethers.getContractFactory("TestERC1271Wallet");
    for (let i = 0; i < 10; i++) {
      const wallet = Wallet.createRandom();
      const contract = await deployer.deployContract(TestERC1271Wallet, i, txParams, wallet.address);
      testERC1271Wallet.push([contract, wallet]);
    }

    Greeter = await ethers.getContractFactory("Greeter");
    greeter1 = await Greeter.deploy();
    greeter2 = await Greeter.deploy();

    const moduleWhiteListAdmin: Wallet = Wallet.createRandom();
    await transferEth(moduleWhiteListAdmin.address, 1);
    const ModuleWhiteList = await ethers.getContractFactory("ModuleWhiteList");
    const moduleWhiteList = await ModuleWhiteList.deploy(moduleWhiteListAdmin.address);
    let ret = await (await moduleWhiteList.updateImplementationWhiteList(greeter1.address, true)).wait();
    expect(ret.status).to.equals(1);
    ret = await (await moduleWhiteList.updateHookWhiteList(greeter2.address, true)).wait();
    expect(ret.status).to.equals(1);

    const DkimKeys = await ethers.getContractFactory("DkimKeys");
    dkimKeysAdmin = Wallet.createRandom().connect(signer.provider!);
    await transferEth(dkimKeysAdmin.address, 10);
    dkimKeys = await deployer.deployContract(DkimKeys, 0, txParams, dkimKeysAdmin.address);

    const ModuleMainUpgradable = await ethers.getContractFactory("ModuleMainUpgradable");
    const moduleMainUpgradable = await deployer.deployContract(
      ModuleMainUpgradable,
      0,
      txParams,
      dkimKeys.address,
      moduleWhiteList.address
    );

    ModuleMain = await ethers.getContractFactory("ModuleMain");
    moduleMain = await deployer.deployContract(
      ModuleMain,
      0,
      txParams,
      deployer.singleFactoryContract.address,
      moduleMainUpgradable.address,
      dkimKeys.address,
      moduleWhiteList.address
    );

    ret = await (await moduleWhiteList.updateImplementationWhiteList(moduleMainUpgradable.address, true)).wait();

    const GasEstimation = await ethers.getContractFactory("GasEstimator");
    gasEstimation = await deployer.deployContract(GasEstimation, 0, txParams);

    const ModuleGuest = await ethers.getContractFactory("ModuleGuest");
    moduleGuest = await deployer.deployContract(ModuleGuest, 0, txParams);

    const privateKey = new NodeRSA({ b: 2048 });
    unipassPrivateKey = privateKey.exportKey("pkcs1");
    ret = await (
      await dkimKeys
        .connect(dkimKeysAdmin)
        .updateDKIMKey(
          solidityPack(["bytes", "bytes"], [Buffer.from("s2055"), Buffer.from("unipass.com")]),
          privateKey.exportKey("components-public").n.subarray(1)
        )
    ).wait();
    expect(ret.status).to.equals(1);
  });
  this.beforeEach(async function () {
    keys = await randomKeys(10, unipassPrivateKey, testERC1271Wallet);
    keysetHash = getKeysetHash(keys);

    proxyModuleMain = await deployer.deployProxyContract(ModuleMain.interface, moduleMain.address, keysetHash, txParams);

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
    const deployData = deployer.singleFactoryContract.interface.encodeFunctionData("deploy", [
      Deployer.getInitCode(moduleMain.address),
      randomBytes(32),
    ]);

    const estimate = await gasEstimation.callStatic.estimate(deployer.singleFactoryContract.address, deployData);
    const gasUsed: number = (
      await (await deployer.singleFactoryContract.deploy(Deployer.getInitCode(moduleMain.address), randomBytes(32))).wait()
    ).gasUsed.toNumber();

    expect(estimate.gas.toNumber() + txBaseCost(deployData)).to.approximately(gasUsed, 5000);
  });
  it("Should estimate account transaction", async function () {
    const newKeysetHash = ethers.utils.hexlify(randomBytes(32));
    const selectedKeys = selectKeys(keys, Role.Owner, OWNER_THRESHOLD);
    const tx = await generateUpdateKeysetHashTx(proxyModuleMain, metaNonce, newKeysetHash, false, selectedKeys);
    const nonce = 1;
    const { chainId } = await proxyModuleMain.provider.getNetwork();
    const feeToken = ethers.constants.AddressZero;
    const feeReceiver = ethers.constants.AddressZero;
    const feeAmount = 0;
    const signature = await generateTransactionSig(chainId, [tx], nonce, feeToken, feeAmount, [], undefined);
    const txData = proxyModuleMain.interface.encodeFunctionData("execute", [[tx], nonce, feeToken, feeReceiver, 0, signature]);
    const estimate = await gasEstimation.callStatic.estimate(proxyModuleMain.address, txData);
    const realTx = await executeCall([tx], chainId, nonce, [], proxyModuleMain, undefined, txParams);
    expect(estimate.gas.toNumber() + txBaseCost(txData)).to.approximately(realTx.gasUsed.toNumber(), 5000);
  });
  it("Should estimate deploy + Account Layer Transaction + Transfer", async function () {
    keys = await randomKeys(10, unipassPrivateKey, testERC1271Wallet);
    keysetHash = getKeysetHash(keys);
    const deployTxData = deployer.singleFactoryContract.interface.encodeFunctionData("deploy", [
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
    const expectedAddress = deployer.getProxyContractAddress(moduleMain.address, keysetHash);
    const newKeysetHash = ethers.utils.hexlify(randomBytes(32));
    proxyModuleMain = ModuleMain.attach(expectedAddress);
    const accountTx = await generateUpdateKeysetHashTx(
      proxyModuleMain,
      metaNonce,
      newKeysetHash,
      true,
      selectKeys(keys, Role.Guardian, GUARDIAN_TIMELOCK_THRESHOLD)
    );
    let value = ethers.utils.parseEther("0.1");
    const transferTx = await generateTransferTx(expectedAddress, ethers.constants.Zero, value);
    const nonce = 1;
    const { chainId } = await moduleGuest.provider.getNetwork();
    const feeToken = ethers.constants.AddressZero;
    const feeReceiver = ethers.constants.AddressZero;
    const feeAmount = 0;
    const signature = await generateTransactionSig(chainId, [accountTx], nonce, feeToken, feeAmount, [], undefined);
    const moduleMainTxData = moduleMain.interface.encodeFunctionData("execute", [
      [accountTx],
      nonce,
      feeToken,
      feeReceiver,
      0,
      signature,
    ]);
    const moduleMainTx = {
      target: expectedAddress,
      callType: CallType.Call,
      gasLimit: 0,
      value: 0,
      data: moduleMainTxData,
    };

    const moduleGuestTxData = moduleGuest.interface.encodeFunctionData("execute", [
      [deployTx, moduleMainTx, transferTx],
      nonce,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      0,
      "0x",
    ]);
    const estimate = await gasEstimation.callStatic.estimate(moduleGuest.address, moduleGuestTxData);
    const realTx = await (
      await moduleGuest.execute([deployTx, moduleMainTx, transferTx], nonce, feeToken, feeReceiver, 0, signature, { value })
    ).wait();
    expect(estimate.gas.toNumber() + txBaseCost(moduleGuestTxData)).to.approximately(realTx.gasUsed.toNumber(), 5000);
    const ret = await proxyModuleMain.lockedKeysetHash();
    expect(ret).to.equal(newKeysetHash);
    expect(await proxyModuleMain.provider.getBalance(expectedAddress)).to.equal(value);
  });
});
