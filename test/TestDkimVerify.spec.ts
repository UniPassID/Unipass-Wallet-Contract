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
import { arrayify, formatBytes32String, hexlify, randomBytes, solidityPack, toUtf8Bytes } from "ethers/lib/utils";
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

  it("Batch Update Public Keys Should Success", async () => {
    let emailServers: string[] = [];
    let keys: string[] = [];
    for (const { selector, domain, n } of [
      {
        selector: formatBytes32String("20161025"),
        domain: formatBytes32String("gmail.com"),
        n: hexlify(
          "0xbe23c6064e1907ae147d2a96c8089c751ee5a1d872b5a7be11845056d28384cfb59978c4a91b4ffe90d3dec0616b3926038f27da4e4d254c8c1283bc9dcdabeac500fbf0e89b98d1059a7aa832893b08c9e51fcea476a69511be611250a91b6a1204a22561bb87b79f1985a687851184533d93dfab986fc2c02830c7b12df9cf0e3259e068b974e3f6cf99fa63744c8b5b23629a4efad425fa2b29b3622443373d4c389389ececc5692e0f15b54b9f49b999fd0754db41a4fc16b8236f68555f9546311326e56c1ea1fe858e3c66f3a1282d440e3b487579dd2c198c8b15a5bab82f1516f48c4013063319c4a06789f943c5fc4e7768c2c0d4ce871c3c51a177"
        ),
      },
      {
        selector: formatBytes32String("20161025"),
        domain: formatBytes32String("googlemail.com"),
        n: hexlify(
          "0xbe23c6064e1907ae147d2a96c8089c751ee5a1d872b5a7be11845056d28384cfb59978c4a91b4ffe90d3dec0616b3926038f27da4e4d254c8c1283bc9dcdabeac500fbf0e89b98d1059a7aa832893b08c9e51fcea476a69511be611250a91b6a1204a22561bb87b79f1985a687851184533d93dfab986fc2c02830c7b12df9cf0e3259e068b974e3f6cf99fa63744c8b5b23629a4efad425fa2b29b3622443373d4c389389ececc5692e0f15b54b9f49b999fd0754db41a4fc16b8236f68555f9546311326e56c1ea1fe858e3c66f3a1282d440e3b487579dd2c198c8b15a5bab82f1516f48c4013063319c4a06789f943c5fc4e7768c2c0d4ce871c3c51a177"
        ),
      },
    ]) {
      const emailServer = solidityPack(["bytes32", "bytes32"], [selector, domain]);
      emailServers.push(emailServer);
      keys.push(n);
    }

    const ret = await (await dkimKeys.batchUpdateDKIMKeys(emailServers, keys)).wait();
    expect(ret.status).to.equals(1);

    for (const [emailServer, key] of emailServers.map((v, i) => [v, keys[i]])) {
      expect(await dkimKeys.callStatic.getDKIMKey(emailServer)).to.equals(key);
    }
  });
});
