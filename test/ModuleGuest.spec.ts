import { expect } from "chai";
import { randomInt } from "crypto";
import { Contract, ContractFactory, Overrides, Wallet } from "ethers";
import { randomBytes } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { initDkimZK, optimalGasLimit, transferEth } from "./utils/common";
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

  let dkimZKAdmin: Wallet;
  let dkimZK: Contract;
  this.beforeAll(async function () {
    const [signer] = await ethers.getSigners();
    deployer = await new Deployer(signer).init();
    txParams = {
      gasLimit: 10000000,
      gasPrice: (await signer.provider?.getGasPrice())?.mul(12).div(10),
    };
    ModuleGuest = await ethers.getContractFactory("ModuleGuest");
    moduleGuest = await deployer.deployContract(ModuleGuest, 0, txParams);

    const DkimZK = await ethers.getContractFactory("DkimZK");
    dkimZKAdmin = Wallet.createRandom().connect(signer.provider!);
    await transferEth(dkimZKAdmin.address, 10);
    dkimZK = (await deployer.deployContract(DkimZK, 0, txParams, dkimZKAdmin.address)).connect(dkimZKAdmin);
    await initDkimZK(dkimZK);

    const DkimKeys = await ethers.getContractFactory("DkimKeys");
    wallet = Wallet.createRandom();
    dkimKeys = await deployer.deployContract(DkimKeys, 0, txParams, wallet.address, dkimZK.address);

    const CallReceiverMock = await ethers.getContractFactory("CallReceiverMock");
    callReceiverMock = await CallReceiverMock.deploy();
  });
  this.beforeEach(async function () {
    valA = randomInt(65535);
    valB = "0x" + Buffer.from(randomBytes(10)).toString("hex");
    data1 = callReceiverMock.interface.encodeFunctionData("testCall", [valA, valB]);
    txs = [
      {
        revertOnError: true,
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
    let ret = await (await moduleGuest.execute(txs, nonce, sig)).wait();
    expect(ret.status).to.equal(1);
    expect(await callReceiverMock.lastValA()).to.equal(valA);
    expect(await callReceiverMock.lastValB()).to.equal(valB);
  });
  it("A Reverted Tx Should Revert", async function () {
    const data2 = callReceiverMock.interface.encodeFunctionData("setRevertFlag", [true]);
    txs.unshift({
      callType: CallType.Call,
      revertOnError: true,
      gasLimit: optimalGasLimit,
      target: callReceiverMock.address,
      value: ethers.constants.Zero,
      data: data2,
    });
    let ret = moduleGuest.execute(txs, nonce, sig);
    await expect(ret).to.be.reverted;
  });
});
