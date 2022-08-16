import { expect } from "chai";
import { Contract } from "ethers";
import { ethers } from "hardhat";
import { DkimParams, parseEmailParams } from "./utils/email";
import * as fs from "fs";

describe("ModuleDkimAuth", function () {
  let dkimAuth: Contract;
  let emails: { from: string; params: DkimParams }[] = [];
  this.beforeAll(async function () {
    let accounts = await ethers.getSigners();

    const DkimKeys = await ethers.getContractFactory("DkimKeys");
    const dkimKeys = await DkimKeys.deploy(accounts[0].address);

    const DkimAuth = await ethers.getContractFactory("DkimAuth");
    dkimAuth = await DkimAuth.deploy(dkimKeys.address);
    const files = await fs.promises.readdir(__dirname + "/emails/emails");
    for (const emailFile of files) {
      const email = await fs.promises.readFile(__dirname + `/emails/emails/${emailFile}`);
      const params = await parseEmailParams(email.toString());
      emails.push(params);
    }
  });
  it("Validate All Emails", async function () {
    emails.forEach(async ({ params, from }, _index, _array) => {
      const ret = await dkimAuth.dkimVerify(params, from);
      expect(ret.ret).true;
      expect(ret.emailHash.startsWith("0x")).true;
      expect(ret.emailHash.length).to.equal(66);
      expect(ret.sigHashHex.startsWith("0x")).true;
      expect(ret.sigHashHex.length).to.equal(134);
    });
  });
});
