import { expect } from "chai";
import { constants, Contract, ContractFactory } from "ethers";
import { ethers } from "hardhat";
import {
  DkimParams,
  EmailType,
  getDkimParams,
  parseDkimResult,
  parseEmailParams,
  SerializeDkimParams,
  Signature,
} from "./utils/email";
import * as fs from "fs";
import { Deployer } from "./utils/deployer";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { arrayify, hexlify, randomBytes, solidityPack, toUtf8Bytes } from "ethers/lib/utils";
import fetchPonyfill from "fetch-ponyfill";
import { sha256 } from "ethereumjs-util";
import { buildResponse, initDkimZK } from "./utils/common";

describe("TestDkimVerify", function () {
  let dkimKeys: Contract;
  let DkimKeys: ContractFactory;
  let dkimZK: Contract;
  let signer: SignerWithAddress;
  let signer1: SignerWithAddress;

  this.beforeEach(async () => {
    [signer, signer1] = await ethers.getSigners();

    const instance = 0;
    const txParams = {
      gasLimit: 10000000,
      gasPrice: (await signer.getGasPrice()).mul(12).div(10),
    };

    const DkimZK = await ethers.getContractFactory("DkimZK");
    dkimZK = await DkimZK.deploy(signer.address);
    await initDkimZK(dkimZK);

    DkimKeys = await ethers.getContractFactory("TestDkimVerify");
    dkimKeys = await DkimKeys.deploy(signer.address, dkimZK.address);

    const deployer = await new Deployer(signer).init();
    const ERC1967 = await ethers.getContractFactory("ERC1967Proxy");
    const calldata = DkimKeys.interface.encodeFunctionData("initialize");
    const erc1967 = await deployer.deployContract(ERC1967, instance, txParams, dkimKeys.address, calldata);
    dkimKeys = DkimKeys.attach(erc1967.address);
  });
  if (process.env.VALIDATE_ALL_EMAILS_BY_ORIGIN) {
    let emails: { from: string; params: DkimParams }[] = [];
    this.beforeAll(async () => {
      const files = await fs.promises.readdir(__dirname + "/emails/emails");
      for (const emailFile of files) {
        const email = await fs.promises.readFile(__dirname + `/emails/emails/${emailFile}`);
        const params = await parseEmailParams(email.toString());
        emails.push(params);
      }
    });
    describe.only("Validate All Emails For Original Email", () => {
      it.only("Validate All Emails For Original Email", async function () {
        await Promise.all(
          emails.map(async ({ params, from }, _index, _array) => {
            let ret;
            try {
              ret = await dkimKeys.dkimParse(SerializeDkimParams(params, EmailType.CallOtherContract), 0, constants.HashZero);

              if (!from.includes("protonmail")) {
                expect(ret.ret).to.be.true;
              }
              expect(ret.emailHash.startsWith("0x")).to.be.true;
              expect(ret.emailHash.length).to.equal(66);
            } catch (error) {
              return Promise.reject(error);
            }
          })
        );
      });
    });
  }

  if (process.env.VALIDATE_ALL_EMAILS_BY_ZK) {
    let emails: { from: string; params: DkimParams; publicInputs: string[]; vkData: string[]; proof: string[] }[] = [];
    let pepper: string;
    this.beforeAll(async () => {
      pepper = hexlify(randomBytes(32));
      const fetch = fetchPonyfill().fetch;
      const files = await fs.promises.readdir(__dirname + "/emails/emails");
      await Promise.all(
        files
          .filter((v, i) => i < 10)
          .map(async (emailFile) => {
            const email = await fs.promises.readFile(__dirname + `/emails/emails/${emailFile}`);
            const [, from, oriResults] = await parseDkimResult(email.toString());
            const results = oriResults.filter((result) => {
              const signature = result.signature as any as Signature;
              return signature.domain !== "1e100.net";
            });

            const url = "http://192.168.2.8:3051";
            let res = await fetch(url + "/request_proof", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                emailHeader: hexlify(toUtf8Bytes(results[0].processedHeader)),
                fromPepper: pepper,
                headerHash: hexlify(sha256(Buffer.from(toUtf8Bytes(results[0].processedHeader)))),
              }),
            });
            let hash = await buildResponse(res);

            await new Promise((resolve) => setTimeout(resolve, 1000));
            res = await fetch(`${url}/query_proof/${hash}`, {
              method: "GET",
            });
            const ret = await buildResponse(res);
            const params = getDkimParams(results, from);
            params.emailHeader = ret.headerPubMatch;
            emails.push({
              ...ret,
              from,
              params,
            });
          })
      );
    });
    describe.only("Validate All Emails For ZK", () => {
      it.only("Validate All Emails For ZK", async function () {
        await Promise.all(
          emails.map(async ({ params, from, publicInputs, vkData, proof }, _index, _array) => {
            let ret;
            try {
              let data = SerializeDkimParams(params, EmailType.CallOtherContract);
              for (const arr of [publicInputs, vkData, proof]) {
                data = solidityPack(["bytes", "uint32", "uint256[]"], [data, arr.length, arr]);
              }
              ret = await dkimKeys.dkimParseByZK(data, 0);

              if (!from.includes("protonmail")) {
                expect(ret.ret).to.be.true;
              }
              expect(ret.emailHash.startsWith("0x")).to.be.true;
              expect(ret.emailHash.length).to.equal(66);
            } catch (error) {
              return Promise.reject(error);
            }
          })
        );
      });
    });
  }
  describe("Test Upgradable", () => {
    let newDkimkeys: Contract;
    this.beforeEach(async () => {
      newDkimkeys = await DkimKeys.deploy(signer1.address, dkimZK.address);
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
