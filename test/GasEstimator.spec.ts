import { expect } from "chai";
import { constants, Contract, ContractFactory, Overrides, Wallet } from "ethers";
import { BytesLike, formatBytes32String, keccak256, randomBytes, solidityPack, toUtf8Bytes } from "ethers/lib/utils";
import { ethers } from "hardhat";
import NodeRSA from "node-rsa";
import {
  getKeysetHash,
  GUARDIAN_TIMELOCK_THRESHOLD,
  OPENID_ISSUER,
  OPENID_KID,
  optimalGasLimit,
  OWNER_THRESHOLD,
  transferEth,
} from "./utils/common";
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
  let moduleMainGasEstimator: Contract;
  let ModuleMainGasEstimator: ContractFactory;
  let moduleGuest: Contract;
  let moduleWhiteList: Contract;
  let gasEstimator: Contract;
  let deployer: Deployer;
  let dkimKeys: Contract;
  let fakeKeys: KeyBase[];
  let dkimKeysAdmin: Wallet;
  let txParams: Overrides;
  let metaNonce: number;
  let unipassPrivateKey: NodeRSA;
  let testERC1271Wallet: [Contract, Wallet][] = [];
  let Greeter: ContractFactory;
  let greeter1: Contract;
  let greeter2: Contract;
  let chainId: number;
  let openIDAdmin: Wallet;
  let openID: Contract;
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

    const moduleWhiteListAdmin: Wallet = Wallet.createRandom().connect(signer.provider!);
    await transferEth(moduleWhiteListAdmin.address, 1);
    const ModuleWhiteList = await ethers.getContractFactory("ModuleWhiteList");
    moduleWhiteList = (await ModuleWhiteList.deploy(moduleWhiteListAdmin.address)).connect(moduleWhiteListAdmin);
    let ret = await (await moduleWhiteList.updateImplementationWhiteList(greeter1.address, true)).wait();
    expect(ret.status).to.equals(1);
    ret = await (await moduleWhiteList.updateHookWhiteList(greeter2.address, true)).wait();
    expect(ret.status).to.equals(1);

    const DkimKeys = await ethers.getContractFactory("DkimKeys");
    dkimKeysAdmin = Wallet.createRandom().connect(signer.provider!);
    await transferEth(dkimKeysAdmin.address, 10);
    dkimKeys = await deployer.deployContract(DkimKeys, 0, txParams, dkimKeysAdmin.address);

    const OpenID = await ethers.getContractFactory("OpenID");
    openIDAdmin = Wallet.createRandom().connect(signer.provider!);
    await transferEth(openIDAdmin.address, 10);
    openID = (await deployer.deployContract(OpenID, 0, txParams, openIDAdmin.address)).connect(openIDAdmin);
    const ERC1967 = await ethers.getContractFactory("ERC1967Proxy");
    const calldata = OpenID.interface.encodeFunctionData("initialize");
    const erc1967 = await deployer.deployContract(ERC1967, 0, txParams, openID.address, calldata);
    openID = openID.attach(erc1967.address);

    ModuleMainGasEstimator = await ethers.getContractFactory("ModuleMainGasEstimator");

    const GasEstimation = await ethers.getContractFactory("GasEstimator");
    gasEstimator = await deployer.deployContract(GasEstimation, 0, txParams);

    const ModuleGuest = await ethers.getContractFactory("ModuleGuest");
    moduleGuest = await deployer.deployContract(ModuleGuest, 0, txParams);

    chainId = (await moduleGuest.provider.getNetwork()).chainId;

    unipassPrivateKey = new NodeRSA({ b: 2048 });
    ret = await (
      await dkimKeys
        .connect(dkimKeysAdmin)
        .updateDKIMKey(
          solidityPack(["bytes32", "bytes32"], [formatBytes32String("s2055"), formatBytes32String("unipass.com")]),
          unipassPrivateKey.exportKey("components-public").n.subarray(1)
        )
    ).wait();
    expect(ret.status).to.equals(1);
    ret = await (
      await openID.updateOpenIDPublidKey(
        keccak256(solidityPack(["bytes", "bytes"], [toUtf8Bytes(OPENID_ISSUER), toUtf8Bytes(OPENID_KID)])),
        unipassPrivateKey.exportKey("components-public").n.slice(1)
      )
    ).wait();
    expect(ret.status).to.equals(1);
    fakeKeys = await randomKeys(10, unipassPrivateKey, testERC1271Wallet);
  });
  this.beforeEach(async function () {
    moduleMainGasEstimator = await ModuleMainGasEstimator.deploy(
      dkimKeys.address,
      openID.address,
      moduleWhiteList.address,
      constants.AddressZero,
      false
    );

    const txRet = await (
      await ethers.getSigners()
    )[0].sendTransaction({
      to: moduleMainGasEstimator.address,
      value: ethers.utils.parseEther("100"),
    });
    expect((await txRet.wait()).status).to.equal(1);
    metaNonce = 1;
  });

  it("Should estimate account transaction", async function () {
    const newKeysetHash = ethers.utils.hexlify(randomBytes(32));
    const selectedKeys = selectKeys(fakeKeys, Role.Owner, OWNER_THRESHOLD);
    const tx = await generateUpdateKeysetHashTx(
      chainId,
      moduleMainGasEstimator,
      metaNonce,
      newKeysetHash,
      false,
      Role.Owner,
      selectedKeys
    );
    const nonce = 1;
    const signature = await generateTransactionSig(chainId, moduleMainGasEstimator.address, [tx], nonce, [], undefined);
    const txData = moduleMainGasEstimator.interface.encodeFunctionData("execute", [[tx], nonce, signature]);
    const estimate = await gasEstimator.callStatic.estimate(moduleMainGasEstimator.address, txData);
    const realTx = await executeCall([tx], chainId, nonce, [], moduleMainGasEstimator, undefined, txParams);
    expect(estimate.gas.toNumber() + txBaseCost(txData)).to.approximately(realTx.gasUsed.toNumber(), 5000);
  });
  it("Should estimate deploy + Account Layer Transaction + Transfer", async function () {
    const keys = await randomKeys(10, unipassPrivateKey, testERC1271Wallet);
    const keysetHash = getKeysetHash(keys);
    const deployTxData = deployer.singleFactoryContract.interface.encodeFunctionData("deploy", [
      Deployer.getInitCode(moduleMainGasEstimator.address),
      keysetHash,
    ]);
    const deployTx = {
      callType: CallType.Call,
      gasLimit: optimalGasLimit,
      target: deployer.singleFactoryContract.address,
      value: 0,
      data: deployTxData,
    };
    const expectedAddress = deployer.getProxyContractAddress(moduleMainGasEstimator.address, keysetHash);
    const newKeysetHash = ethers.utils.hexlify(randomBytes(32));
    moduleMainGasEstimator = ModuleMainGasEstimator.attach(expectedAddress);
    const accountTx = await generateUpdateKeysetHashTx(
      chainId,
      moduleMainGasEstimator,
      metaNonce,
      newKeysetHash,
      true,
      Role.Guardian,
      selectKeys(fakeKeys, Role.Guardian, GUARDIAN_TIMELOCK_THRESHOLD)
    );
    let value = ethers.utils.parseEther("0.1");
    const transferTx = await generateTransferTx(expectedAddress, ethers.constants.Zero, value);
    const nonce = 1;
    const signature = await generateTransactionSig(chainId, moduleMainGasEstimator.address, [accountTx], nonce, [], undefined);
    const moduleMainTxData = moduleMainGasEstimator.interface.encodeFunctionData("execute", [[accountTx], nonce, signature]);
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
      "0x",
    ]);
    const estimate = await gasEstimator.callStatic.estimate(moduleGuest.address, moduleGuestTxData);
    const realTx = await (await moduleGuest.execute([deployTx, moduleMainTx, transferTx], nonce, signature, { value })).wait();
    expect(estimate.gas.toNumber() + txBaseCost(moduleGuestTxData)).to.approximately(realTx.gasUsed.toNumber(), 5000);
  });
});
