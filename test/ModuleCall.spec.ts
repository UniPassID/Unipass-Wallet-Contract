import { expect } from "chai";
import { Contract, ContractFactory, Wallet } from "ethers";
import { getCreate2Address, keccak256, solidityPack } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { emailHash } from "./utils/email";
import {
  ActionType,
  CallType,
  generateAccountLayerSignature,
  generateTransactionSig,
  SigType,
} from "./utils/sigPart";

const optimalGasLimit = ethers.constants.Two.pow(21);

describe("ModuleCall", function () {
  let testModuleCall: Contract;
  let TestModuleCall: ContractFactory;
  let proxyTestModuleCall: Contract;
  let factory: Contract;
  let dkimKeys: Contract;
  let masterKey: Wallet;
  let keysetHash: string;
  let threshold: number;
  let recoveryEmails: string[];
  let wallet: Wallet;
  this.beforeAll(async function () {
    const Factory = await ethers.getContractFactory("Factory");
    factory = await Factory.deploy();
    TestModuleCall = await ethers.getContractFactory("TestModuleCall");
    testModuleCall = await TestModuleCall.deploy(factory.address);

    const DkimKeys = await ethers.getContractFactory("DkimKeys");
    wallet = Wallet.createRandom();
    dkimKeys = await DkimKeys.deploy(wallet.address);
  });
  this.beforeEach(async function () {
    threshold = 4;
    recoveryEmails = [];
    masterKey = Wallet.createRandom();

    keysetHash = keccak256(
      ethers.utils.solidityPack(
        ["address", "uint16"],
        [masterKey.address, threshold]
      )
    );
    for (let i = 0; i < 10; i++) {
      const recoveryEmail =
        Wallet.createRandom().privateKey.substring(16) + "@mail.unipass.me";
      recoveryEmails.push(recoveryEmail);
      keysetHash = keccak256(
        ethers.utils.solidityPack(
          ["bytes32", "bytes32"],
          [keysetHash, emailHash(recoveryEmail)]
        )
      );
    }
    const ret = await (
      await factory.deploy(testModuleCall.address, keysetHash, dkimKeys.address)
    ).wait();
    expect(ret.status).to.equal(1);

    const code = ethers.utils.solidityPack(
      ["bytes", "uint256"],
      [
        "0x603a600e3d39601a805130553df3363d3d373d3d3d363d30545af43d82803e903d91601857fd5bf3",
        testModuleCall.address,
      ]
    );
    const codeHash = keccak256(code);
    const salt = keccak256(
      solidityPack(["bytes32", "address"], [keysetHash, dkimKeys.address])
    );
    const expectedAddress = getCreate2Address(factory.address, salt, codeHash);
    proxyTestModuleCall = TestModuleCall.attach(expectedAddress);
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
    const value = 10;
    let tx = {
      callType: CallType.Call,
      gasLimit: optimalGasLimit,
      target: to.address,
      value,
      data: "0x",
    };
    const nonce = 1;
    const { chainId } = await proxyTestModuleCall.provider.getNetwork();
    const feeToken = Wallet.createRandom().address;
    const feeReceiver = Wallet.createRandom().address;
    const feeAmount = 0;

    const signature = generateTransactionSig(
      chainId,
      [tx],
      nonce,
      feeToken,
      feeAmount,
      masterKey,
      threshold,
      recoveryEmails,
      [...Array(threshold).keys()].map((v) => v + 1),
      SigType.SigMasterKey
    );
    const ret = await (
      await proxyTestModuleCall.execute(
        [tx],
        nonce,
        feeToken,
        feeReceiver,
        0,
        signature
      )
    ).wait();
    expect(ret.status).to.equal(1);
    expect(await proxyTestModuleCall.provider.getBalance(to.address)).equal(
      value
    );
  });
  it("Test A Account Layer Transaction", async function () {
    const to = Wallet.createRandom();
    const newKeysetHash = Wallet.createRandom().privateKey;
    const data = await generateAccountLayerSignature(
      proxyTestModuleCall.address,
      ActionType.UpdateKeysetHash,
      1,
      undefined,
      newKeysetHash,
      masterKey,
      threshold,
      recoveryEmails,
      SigType.SigMasterKey
    );
    const value = 0;
    let tx = {
      callType: CallType.CallAccountLayer,
      gasLimit: optimalGasLimit,
      target: to.address,
      value,
      data,
    };
    const nonce = 1;
    const { chainId } = await proxyTestModuleCall.provider.getNetwork();
    const feeToken = Wallet.createRandom().address;
    const feeReceiver = Wallet.createRandom().address;
    const feeAmount = 0;

    const signature = generateTransactionSig(
      chainId,
      [tx],
      nonce,
      feeToken,
      feeAmount,
      masterKey,
      threshold,
      recoveryEmails,
      [...Array(threshold).keys()].map((v) => v + 1),
      SigType.SigNone
    );
    const ret = await (
      await proxyTestModuleCall.execute(
        [tx],
        nonce,
        feeToken,
        feeReceiver,
        0,
        signature
      )
    ).wait();
    expect(ret.status).to.equal(1);
    expect(await proxyTestModuleCall.newKeysetHash()).to.equal(newKeysetHash);
  });
  it("Test Multiple Transactions", async function () {
    const to = Wallet.createRandom();
    const newKeysetHash = Wallet.createRandom().privateKey;
    let data = await generateAccountLayerSignature(
      proxyTestModuleCall.address,
      ActionType.UpdateKeysetHash,
      1,
      undefined,
      newKeysetHash,
      masterKey,
      threshold,
      recoveryEmails,
      SigType.SigMasterKey
    );
    let value = 0;
    let tx1 = {
      callType: CallType.CallAccountLayer,
      gasLimit: optimalGasLimit,
      target: to.address,
      value,
      data,
    };

    data = "0x";
    value = 100;
    let tx2 = {
      callType: CallType.Call,
      gasLimit: optimalGasLimit,
      target: to.address,
      value,
      data,
    };

    const nonce = 1;
    const { chainId } = await proxyTestModuleCall.provider.getNetwork();
    const feeToken = Wallet.createRandom().address;
    const feeReceiver = Wallet.createRandom().address;
    const feeAmount = 0;

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
      SigType.SigMasterKey
    );
    const ret = await (
      await proxyTestModuleCall.execute(
        [tx1, tx2],
        nonce,
        feeToken,
        feeReceiver,
        0,
        signature
      )
    ).wait();
    expect(ret.status).to.equal(1);
    expect(await proxyTestModuleCall.provider.getBalance(to.address)).equal(
      value
    );
    expect(await proxyTestModuleCall.newKeysetHash()).to.equal(newKeysetHash);
  });
});
