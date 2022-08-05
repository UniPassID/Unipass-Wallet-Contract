import { expect } from "chai";
import { randomInt } from "crypto";
import { Contract, ContractFactory, Overrides, Wallet } from "ethers";
import { randomBytes } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { optimalGasLimit } from "./utils/common";
import { Deployer } from "./utils/deployer";
import { CallType, Transaction } from "./utils/sigPart";

describe("ModuleGuest", function () {
  let moduleGuest: Contract;
  let ModuleGuest: ContractFactory;

  let deployer: Deployer;
  let dkimKeys: Contract;
  let wallet: Wallet;
  let txs: Transaction[];
  let callReceiverMock: Contract;

  let valA: number;
  let valB: string;
  let data1: string;

  let nonce: number;
  let sig: string;
  let txParams: Overrides;
  this.beforeAll(async function () {
    const [signer] = await ethers.getSigners();
    deployer = await new Deployer(signer).init();
    txParams = {
      gasLimit: 6000000,
      gasPrice: (await signer.provider?.getGasPrice())?.mul(12).div(10),
    };
    ModuleGuest = await ethers.getContractFactory("ModuleGuest");
    moduleGuest = await deployer.deployContract(ModuleGuest, 0, txParams);

    const DkimKeys = await ethers.getContractFactory("DkimKeys");
    wallet = Wallet.createRandom();
    dkimKeys = await deployer.deployContract(
      DkimKeys,
      0,
      txParams,
      wallet.address
    );

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
      `VM Exception while processing transaction: reverted with custom error 'InvalidCallType(1)'`
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
