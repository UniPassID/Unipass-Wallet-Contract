import { expect } from "chai";
import { Contract } from "ethers";
import { ethers } from "hardhat";
import { parseEmailParams, EmailParams } from "./utils/email";
import * as fs from "fs";

describe("LibDkimValidator", function () {
  let emailDkimValidator: Contract;
  let emails: EmailParams[] = [];
  let email1275: EmailParams;
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
      const ret = await parseEmailParams(email.toString());
      emails.push(ret);
      if (emailFile == "email-1275.eml") {
        email1275 = ret;
      }
    }
  });
  it("Validate Emails DKIM From Header Contains Uppercase", async function () {
    const ret = emails.find(({ params, from }) => {
      const headers = Buffer.from(
        params.emailHeader.substring(2),
        "hex"
      ).toString();
      let ret = headers
        .split("\r\n")
        .filter((v) => v.startsWith("from:"))
        .map((v) => {
          const ret = /<.+>/.exec(v);
          if (!!ret && !!ret[0] && !ret[0].includes("protonmail")) {
            return ret[0];
          } else {
            return null;
          }
        })
        .find((v) => {
          if (!!v && v.toLowerCase() !== v) {
            return true;
          } else {
            return false;
          }
        });
      if (!!ret) {
        return true;
      } else {
        return false;
      }
    });
    expect(ret).to.not.null;
  });
  if (process.env.TEST_ALL_EMAILS) {
    it.only("Test All Emails", async function () {
      emails.forEach(async ({ params, from }, _index, _array) => {
        const ret = await emailDkimValidator.parseHeader(params);
        expect(ret.emailfrom).to.equal(ethers.utils.hexValue(from));
        expect(ret.sigHashHex.startsWith("0x")).true;
        expect(ret.sigHashHex.length).to.equal(134);
        expect(ret.sdid.startsWith("0x")).true;
        expect(ret.sdid.length).gt(2);
        expect(ret.selector.startsWith("0x")).true;
        expect(ret.selector.length).gt(2);
      });
    });
  }
  it("Validate Utf8 Subject", async function () {
    const ret = await emailDkimValidator.parseHeader(email1275.params);
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
