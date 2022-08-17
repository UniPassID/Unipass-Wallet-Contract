import { expect } from "chai";
import { Contract } from "ethers";
import { ethers } from "hardhat";
import { DkimParams, parseEmailParams } from "./utils/email";
import * as fs from "fs";
import { toUtf8Bytes } from "ethers/lib/utils";

describe("ModuleDkimAuth", function () {
  let dkimAuth: Contract;
  let dkimKeys: Contract;
  let emails: { from: string; params: DkimParams }[] = [];
  this.beforeAll(async function () {
    let accounts = await ethers.getSigners();

    const DkimKeys = await ethers.getContractFactory("DkimKeys");
    dkimKeys = await DkimKeys.deploy(accounts[0].address);

    const DkimAuth = await ethers.getContractFactory("DkimAuth");
    dkimAuth = await DkimAuth.deploy(dkimKeys.address);
    const files = await fs.promises.readdir(__dirname + "/emails/emails");
    for (const emailFile of files) {
      const email = await fs.promises.readFile(__dirname + `/emails/emails/${emailFile}`);
      const params = await parseEmailParams(email.toString());
      emails.push(params);
    }
  });
  if (process.env.VALIDATE_ALL_EMAILS) {
    it.only("Validate All Emails", async function () {
      await Promise.all(
        emails.map(async ({ params, from }, _index, _array) => {
          const ret = await dkimKeys.dkimVerifyParams(params, toUtf8Bytes(from));
          if (!from.includes("protonmail")) {
            expect(ret.ret).to.be.true;
          }
          console.log(_index);
          expect(ret.emailHash.startsWith("0x")).to.be.true;
          expect(ret.emailHash.length).to.equal(66);
          expect(ret.sigHashHex.startsWith("0x")).to.be.true;
          expect(ret.sigHashHex.length).to.equal(134);
        })
      );
    });
  }
});
