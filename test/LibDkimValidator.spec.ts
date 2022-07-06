import { expect } from "chai";
import { Contract } from "ethers";
import { ethers } from "hardhat";
import { DkimParams, parseEmailParams } from "./utils/email";
import * as fs from "fs";

describe("LibDkimValidator", function () {
  let emailDkimValidator: Contract;
  let emails: DkimParams[] = [];
  let email1275: DkimParams;
  this.beforeAll(async function () {
    const EmailDkimValidator = await ethers.getContractFactory(
      "EmailDkimValidator"
    );
    emailDkimValidator = await EmailDkimValidator.deploy();
    const files = await fs.promises.readdir(__dirname + "/emails/emails");
    for (const emailFile of files) {
      const email = await fs.promises.readFile(
        __dirname + `/emails/emails/${emailFile}`
      );
      const params = await parseEmailParams(email.toString());
      if (params != null && params != undefined) {
        emails.push(params);
        if (emailFile == "email-1275.eml") {
          email1275 = params;
        }
      }
    }
  });
  it("Validate All Emails", async function () {
    emails.forEach(async (value, _index, _array) => {
      const ret = await emailDkimValidator.parseHeader(value);
      expect(ret.emailHash.startsWith("0x")).true;
      expect(ret.emailHash.length).to.equal(66);
      expect(ret.sigHashHex.startsWith("0x")).true;
      expect(ret.sigHashHex.length).to.equal(134);
      expect(ret.sdid.startsWith("0x")).true;
      expect(ret.sdid.length).gt(2);
      expect(ret.selector.startsWith("0x")).true;
      expect(ret.selector.length).gt(2);
    });
  });
  it("Validate Utf8 Subject", async function () {
    const ret = await emailDkimValidator.parseHeader(email1275);
    expect(ret.sigHashHex).to.equal(
      "0x" +
        Buffer.from(
          "0x5b625397d354740ea83b70d0b808b6c97a60e7b67f2235b75cb04fd414b7d719",
          "utf-8"
        ).toString("hex")
    );
    expect(ret.selector).to.equal(
      "0x" + Buffer.from("20210112", "utf8").toString("hex")
    );
    expect(ret.sdid).to.equal(
      "0x" + Buffer.from("gmail.com", "utf8").toString("hex")
    );
  });
});
