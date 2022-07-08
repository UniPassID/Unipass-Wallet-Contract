import { expect } from "chai";
import { Contract, Wallet } from "ethers";
import { solidityPack } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { Greeter } from "../typechain";
import { transferEth } from "./utils/common";
import { generateHookTx, HookActionType } from "./utils/hook";

describe("ModuleHooks", function () {
  let moduleHooks: Contract;
  let testERC721: Contract;
  let testERC721Admin: Wallet;
  let testERC721Owner1: Wallet;
  let ERC721TokenId1: string;
  let testERC1155: Contract;
  let testERC1155Admin: Wallet;
  let testERC1155Owner1: Wallet;
  let ERC1155TokenId1: string;
  let testERC20: Contract;
  let testERC20Admin: Wallet;
  let testERC20Owner1: Wallet;
  let greeter: Contract;
  this.beforeAll(async function () {
    const TestERC721 = await ethers.getContractFactory("TestERC721");
    testERC721 = await TestERC721.deploy();
    testERC721Admin = Wallet.createRandom().connect(testERC721.provider);
    await testERC721.transferOwnership(testERC721Admin.address);
    testERC721 = testERC721.connect(testERC721Admin);
    testERC721Owner1 = Wallet.createRandom().connect(testERC721.provider);
    await transferEth(testERC721Admin.address, 100);
    await transferEth(testERC721Owner1.address, 100);
    await testERC721.safeMint(testERC721Owner1.address);
    ERC721TokenId1 = await testERC721.tokenOfOwnerByIndex(
      testERC721Owner1.address,
      0
    );
  });
  this.beforeAll(async function () {
    const TestERC1155 = await ethers.getContractFactory("TestERC1155");
    testERC1155 = await TestERC1155.deploy();
    testERC1155Admin = Wallet.createRandom().connect(testERC1155.provider);
    await testERC1155.transferOwnership(testERC1155Admin.address);
    testERC1155 = testERC1155.connect(testERC1155Admin);
    testERC1155Owner1 = Wallet.createRandom().connect(testERC1155.provider);
    await transferEth(testERC1155Admin.address, 100);
    await transferEth(testERC1155Owner1.address, 100);
    ERC1155TokenId1 = Wallet.createRandom().privateKey;
    await testERC1155.mint(
      testERC1155Owner1.address,
      ERC1155TokenId1,
      100,
      "0x"
    );
  });
  this.beforeAll(async function () {
    const TestERC20 = await ethers.getContractFactory("TestERC20");
    testERC20 = await TestERC20.deploy();
    testERC20Admin = Wallet.createRandom().connect(testERC20.provider);
    await testERC20.transferOwnership(testERC20Admin.address);
    testERC20 = testERC20.connect(testERC20Admin);
    testERC20Owner1 = Wallet.createRandom().connect(testERC20.provider);
    await transferEth(testERC20Admin.address, 100);
    await transferEth(testERC20Owner1.address, 100);
    await testERC20.mint(testERC20Owner1.address, 100);
  });
  this.beforeAll(async function () {
    const Greeter = await ethers.getContractFactory("Greeter");
    greeter = await Greeter.deploy();
  });

  this.beforeEach(async function () {
    const ModuleHooks = await ethers.getContractFactory("TestModuleHooks");
    moduleHooks = await ModuleHooks.deploy();
  });

  it("Test ERC721 Transfer", async function () {
    const ret = await (
      await testERC721
        .connect(testERC721Owner1)
        .transferFrom(
          testERC721Owner1.address,
          moduleHooks.address,
          ERC721TokenId1
        )
    ).wait();
    expect(ret.status).to.equal(1);
    expect(await testERC721.ownerOf(ERC721TokenId1)).to.equal(
      moduleHooks.address
    );
  });

  it("Test ERC1155 Transfer", async function () {
    const value = 10;
    const ret = await (
      await testERC1155
        .connect(testERC1155Owner1)
        .safeTransferFrom(
          testERC1155Owner1.address,
          moduleHooks.address,
          ERC1155TokenId1,
          value,
          "0x"
        )
    ).wait();
    expect(ret.status).to.equal(1);
    expect(
      await testERC1155.balanceOf(moduleHooks.address, ERC1155TokenId1)
    ).equal(value);
  });

  it("Test ERC20 Transfer", async function () {
    const value = 10;
    const ret = await (
      await testERC20
        .connect(testERC20Owner1)
        .transfer(moduleHooks.address, value)
    ).wait();
    expect(ret.status).to.equal(1);
    expect(await testERC20.balanceOf(moduleHooks.address)).equal(value);
  });

  it("Test ETH Transfer", async function () {
    const value = 10;
    const ret = await transferEth(moduleHooks.address, value);
    expect(ret.status).to.equal(1);
    expect(await moduleHooks.provider.getBalance(moduleHooks.address)).equal(
      ethers.utils.parseEther(value.toString())
    );
  });
  it("Test Greeter Hook", async function () {
    const selector = greeter.interface.getSighash("ret1");
    let ret;
    ret = await (
      await moduleHooks.executeHooksTx(
        generateHookTx(HookActionType.AddHook, selector, greeter.address)
      )
    ).wait();
    expect(ret.status).to.equal(1);
    ret = await moduleHooks.readHook(selector);
    expect(ret).to.equal(greeter.address);
    const data = greeter.interface.encodeFunctionData("ret1");
    ret = await (
      await ethers.getSigners()
    )[0].call({ to: moduleHooks.address, data });
    expect(ret).equal(solidityPack(["uint256"], [1]));

    ret = await (
      await moduleHooks.executeHooksTx(
        generateHookTx(HookActionType.RemoveHook, selector, undefined)
      )
    ).wait();
    expect(ret.status).to.equal(1);
    ret = await moduleHooks.readHook(selector);
    expect(ret).to.equal(ethers.constants.AddressZero);
  });
});
