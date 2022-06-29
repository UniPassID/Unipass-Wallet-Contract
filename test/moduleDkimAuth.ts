import { expect } from "chai";
import { Contract } from "ethers";
import { ethers } from "hardhat";
import { DkimParams, parseEmailParams } from "./utils";
import * as fs from "fs";

describe("ModuleDkimAuth", function () {
  let moduleDkimAuth: Contract;
  let emails: DkimParams[] = [];
  this.beforeAll(async function () {
    let accounts = await ethers.getSigners();

    const DkimKeys = await ethers.getContractFactory("DkimKeys");
    const dkimKeys = await DkimKeys.deploy(accounts[0].address);

    const ModuleDkimAuth = await ethers.getContractFactory("ModuleDkimAuth");
    moduleDkimAuth = await ModuleDkimAuth.deploy(accounts[0].address);
    await moduleDkimAuth.init(dkimKeys.address);
    const files = await fs.promises.readdir(__dirname + "/emails/emails");
    for (const emailFile of files) {
      const email = await fs.promises.readFile(
        __dirname + `/emails/emails/${emailFile}`
      );
      const params = await parseEmailParams(email.toString());
      if (params != null && params != undefined) {
        emails.push(params);
      }
    }
  });
  it("Validate All Emails", async function () {
    emails.forEach(async (value, _index, _array) => {
      const ret = await moduleDkimAuth.dkimVerify(value);
      expect(ret.ret).true;
      expect(ret.emailHash.startsWith("0x")).true;
      expect(ret.emailHash.length).to.equal(66);
      expect(ret.sigHashHex.startsWith("0x")).true;
      expect(ret.sigHashHex.length).to.equal(134);
    });
  });
});
