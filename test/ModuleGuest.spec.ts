import { expect } from "chai";
import { randomInt } from "crypto";
import { Contract, ContractFactory, Wallet } from "ethers";
import { randomBytes } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { optimalGasLimit } from "./utils/common";
import { CallType, Transaction } from "./utils/sigPart";

describe("ModuleGuest", function () {
  let moduleGuest: Contract;
  let ModuleGuest: ContractFactory;

  let factory: Contract;
  let dkimKeys: Contract;
  let wallet: Wallet;
  let txs: Transaction[];
  let callReceiverMock: Contract;

  let valA: number;
  let valB: string;
  let data1: string;

  let nonce: number;
  let sig: string;
  this.beforeAll(async function () {
    const Factory = await ethers.getContractFactory("Factory");
    factory = await Factory.deploy();
    ModuleGuest = await ethers.getContractFactory("ModuleGuest");
    moduleGuest = await ModuleGuest.deploy();

    const DkimKeys = await ethers.getContractFactory("DkimKeys");
    wallet = Wallet.createRandom();
    dkimKeys = await DkimKeys.deploy(wallet.address);

    const CallReceiverMock = await ethers.getContractFactory(
      "CallReceiverMock"
    );
    callReceiverMock = await CallReceiverMock.deploy();
  });
  this.beforeEach(async function () {
    valA = randomInt(65535);
    valB = "0x" + Buffer.from(randomBytes(10)).toString("hex");
    data1 = callReceiverMock.interface.encodeFunctionData("testCall", [
      valA,
      valB,
    ]);
    txs = [
      {
        callType: CallType.Call,
        gasLimit: optimalGasLimit,
        target: callReceiverMock.address,
        value: ethers.constants.Zero,
        data: data1,
      },
    ];
    nonce = randomInt(65535);
    sig = "0x" + Buffer.from(randomBytes(63)).toString("hex");
  });
  it("A Call Transaction Should Success With Random Nonce and Random Signature", async function () {
    let ret = await (
      await moduleGuest.execute(
        txs,
        nonce,
        ethers.constants.AddressZero,
        ethers.constants.AddressZero,
        0,
        sig
      )
    ).wait();
    expect(ret.status).to.equal(1);
    expect(await callReceiverMock.lastValA()).to.equal(valA);
    expect(await callReceiverMock.lastValB()).to.equal(valB);
  });
  it("A DelegateCall Should Revert", async function () {
    txs = [
      {
        callType: CallType.DelegateCall,
        gasLimit: optimalGasLimit,
        target: callReceiverMock.address,
        value: ethers.constants.Zero,
        data: data1,
      },
    ];
    let ret = moduleGuest.execute(
      txs,
      0,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      0,
      "0x"
    );
    await expect(ret).to.be.revertedWith(
      `VM Exception while processing transaction: reverted with custom error 'invalidCallType(1)'`
    );
  });
  it("A CallAccountLayer Should Revert", async function () {
    txs = [
      {
        callType: CallType.CallAccountLayer,
        gasLimit: optimalGasLimit,
        target: callReceiverMock.address,
        value: ethers.constants.Zero,
        data: data1,
      },
    ];
    let ret = moduleGuest.execute(
      txs,
      nonce,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      0,
      sig
    );
    await expect(ret).to.be.revertedWith(
      `VM Exception while processing transaction: reverted with custom error 'invalidCallType(2)'`
    );
  });
  it("A CallHooks Should Revert", async function () {
    txs = [
      {
        callType: CallType.CallHooks,
        gasLimit: optimalGasLimit,
        target: callReceiverMock.address,
        value: ethers.constants.Zero,
        data: data1,
      },
    ];
    let ret = moduleGuest.execute(
      txs,
      nonce,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      0,
      sig
    );
    await expect(ret).to.be.revertedWith(
      `VM Exception while processing transaction: reverted with custom error 'invalidCallType(3)'`
    );
  });
  it("A Reverted Tx Should Revert", async function () {
    const data2 = callReceiverMock.interface.encodeFunctionData(
      "setRevertFlag",
      [true]
    );
    txs.unshift({
      callType: CallType.Call,
      gasLimit: optimalGasLimit,
      target: callReceiverMock.address,
      value: ethers.constants.Zero,
      data: data2,
    });
    let ret = moduleGuest.execute(
      txs,
      nonce,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      0,
      sig
    );
    await expect(ret).to.be.reverted;
  });
});
