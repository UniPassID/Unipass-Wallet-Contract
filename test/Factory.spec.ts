import { expect } from "chai";
import { Contract, ContractFactory, Wallet } from "ethers";
import { getCreate2Address, keccak256, sha256 } from "ethers/lib/utils";
import { ethers } from "hardhat";

describe("Factory", function () {
  let greet: Contract;
  let Greet: ContractFactory;
  let factory: Contract;
  let Factory: ContractFactory;
  let masterKey: string;
  let salt: string;
  let threshold: number;
  let recoveryEmails: string[] = [];
  this.beforeAll(async function () {
    Factory = await ethers.getContractFactory("Factory");
    factory = await Factory.deploy();
    Greet = await ethers.getContractFactory("Greeter");
    greet = await Greet.deploy();
  });
  this.beforeEach(async function () {
    masterKey = Wallet.createRandom().address;
    for (let i = 0; i < 10; i++) {
      recoveryEmails.push(Wallet.createRandom().privateKey);
    }
    threshold = 4;
    salt = sha256(
      ethers.utils.solidityPack(
        ["address", "uint256", "bytes32[]"],
        [masterKey, threshold, recoveryEmails]
      )
    );
  });
  it("Should deploy success", async function () {
    const ret = await (
      await factory.deploy(greet.address, salt, Wallet.createRandom().address)
    ).wait();
    expect(ret.status).to.equal(1);
    const code = ethers.utils.solidityPack(
      ["bytes", "uint256"],
      [
        "0x603a600e3d39601a805130553df3363d3d373d3d3d363d30545af43d82803e903d91601857fd5bf3",
        greet.address,
      ]
    );
    const codeHash = keccak256(code);
    console.log("code hash: ", codeHash);

    const expectedAddres = getCreate2Address(factory.address, salt, codeHash);
    const proxyGreet = Greet.attach(expectedAddres);
    console.log("get code", await factory.provider.getCode(expectedAddres));

    // expect(await proxyGreet.no()).to.equal(threshold);
    // expect(await proxyGreet.inner(0)).to.equal(recoveryEmails[0]);
    // expect(await proxyGreet.greeting()).to.equal(masterKey);
  });
});
