import { expect } from "chai";
import { Contract, ContractFactory } from "ethers";
import { ethers } from "hardhat";
import { DkimParams, parseEmailParams, SerializeDkimParams } from "./utils/email";
import * as fs from "fs";
import { Deployer } from "./utils/deployer";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

describe("DkimKeys", function () {
  let dkimKeys: Contract;
  let DkimKeys: ContractFactory;
  let emails: { from: string; params: DkimParams }[] = [];
  let signer: SignerWithAddress;
  let signer1: SignerWithAddress;
  this.beforeAll(async () => {
    const files = await fs.promises.readdir(__dirname + "/emails/emails");
    for (const emailFile of files) {
      const email = await fs.promises.readFile(__dirname + `/emails/emails/${emailFile}`);
      const params = await parseEmailParams(email.toString());
      emails.push(params);
    }
  });
  this.beforeEach(async function () {
    [signer, signer1] = await ethers.getSigners();

    DkimKeys = await ethers.getContractFactory("DkimKeys");
    dkimKeys = await DkimKeys.deploy(signer.address);

    const instance = 0;
    const txParams = {
      gasLimit: 10000000,
      gasPrice: (await signer.getGasPrice()).mul(12).div(10),
    };

    const deployer = await new Deployer(signer).init();
    const ERC1967 = await ethers.getContractFactory("ERC1967Proxy");
    const calldata = DkimKeys.interface.encodeFunctionData("initialize");
    const erc1967 = await deployer.deployContract(ERC1967, instance, txParams, dkimKeys.address, calldata);
    dkimKeys = DkimKeys.attach(erc1967.address);
  });
  if (process.env.VALIDATE_ALL_EMAILS) {
    it.only("Validate All Emails", async function () {
      await Promise.all(
        emails.map(async ({ params, from }, _index, _array) => {
          let ret;
          try {
            ret = await dkimKeys.dkimVerify(SerializeDkimParams(params), 0);

            if (!from.includes("protonmail")) {
              expect(ret.ret).to.be.true;
            }
            expect(ret.emailHash.startsWith("0x")).to.be.true;
            expect(ret.emailHash.length).to.equal(66);
            expect(ret.sigHashHex.startsWith("0x")).to.be.true;
            expect(ret.sigHashHex.length).to.equal(134);
          } catch (error) {
            console.log(_index, params, from);
            return Promise.reject(error);
          }
        })
      );
    });
  }
  describe("Test Upgradable", () => {
    let newDkimkeys: Contract;
    this.beforeEach(async () => {
      newDkimkeys = await DkimKeys.deploy(signer1.address);
    });
    it("Upgrade Should Success", async () => {
      expect(await dkimKeys.getAdmin()).equals(signer.address);
      const ret = await (await dkimKeys.upgradeTo(newDkimkeys.address)).wait();
      expect(ret.status).to.equals(1);
      expect(await dkimKeys.getAdmin()).to.equals(signer1.address);
      expect(await dkimKeys.getAdmin()).to.not.equals(signer.address);
    });
    it("Not Admin Should Not Upgradable Successfully", async () => {
      const upgrade = async () => {
        return await (await dkimKeys.connect(signer1).upgradeTo(newDkimkeys.address)).wait();
      };
      await expect(upgrade()).to.revertedWith("NOT_AUTHORIZED");
    });
  });
});
