import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { constants, Contract } from "ethers";
import { hexlify, keccak256, randomBytes, solidityPack, toUtf8Bytes } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { Deployer } from "./utils/deployer";
import * as jose from "jose";
import NodeRSA from "node-rsa";
import { expect } from "chai";
import { OPENID_AUDIENCE, OPENID_ISSUER, OPENID_KID } from "./utils/common";

describe("Test Open ID", function () {
  let openID: Contract;
  let signer: SignerWithAddress;
  let jwt: string;
  let privateKey: jose.KeyLike;
  let sub: string;
  this.beforeAll(async () => {
    const OpenID = await ethers.getContractFactory("OpenID");
    [signer] = await ethers.getSigners();
    openID = await OpenID.deploy(signer.address);

    const instance = 0;
    const txParams = {
      gasLimit: 10000000,
      gasPrice: (await signer.getGasPrice()).mul(12).div(10),
    };

    const deployer = await new Deployer(signer).init();
    const ERC1967 = await ethers.getContractFactory("ERC1967Proxy");
    const calldata = OpenID.interface.encodeFunctionData("initialize");
    const erc1967 = await deployer.deployContract(ERC1967, instance, txParams, openID.address, calldata);
    openID = openID.attach(erc1967.address);

    const nodeRsa = new NodeRSA({ b: 2048 });
    privateKey = await jose.importPKCS8(nodeRsa.exportKey("pkcs8-pem"), "RS256");

    let ret = await (
      await openID.updateOpenIDPublidKey(
        keccak256(solidityPack(["bytes", "bytes"], [toUtf8Bytes(OPENID_ISSUER), toUtf8Bytes(OPENID_KID)])),
        nodeRsa.exportKey("components-public").n.slice(1)
      )
    ).wait();
    expect(ret.status).to.equals(1);

    ret = await (
      await openID.addOpenIDAudience(
        keccak256(solidityPack(["bytes", "bytes"], [toUtf8Bytes(OPENID_ISSUER), toUtf8Bytes(OPENID_AUDIENCE)]))
      )
    ).wait();
    expect(ret.status).to.equals(1);
  });

  this.beforeEach(async () => {
    sub = hexlify(randomBytes(16));
    jwt = await new jose.SignJWT({ nonce: constants.HashZero })
      .setProtectedHeader({ alg: "RS256", kid: OPENID_KID })
      .setIssuer(OPENID_ISSUER)
      .setAudience(OPENID_AUDIENCE)
      .setExpirationTime("2h")
      .setIssuedAt(Date.now() / 1000 - 300)
      .setSubject(sub)
      .sign(privateKey);
  });

  it("Verify Open ID Should Success", async () => {
    const [headerBase64, payloadBase64, signatureBase64] = jwt.split(".");
    const header = Buffer.from(headerBase64, "base64").toString();
    const payload = Buffer.from(payloadBase64, "base64").toString();

    const signature = Buffer.from(signatureBase64, "base64");
    const issLeftIndex = payload.indexOf('"iss":"') + 7;
    let issRightIndex = payload.indexOf('",', issLeftIndex);
    issRightIndex = issRightIndex >= 0 ? issRightIndex : payload.indexOf('"}', issLeftIndex);
    const kidLeftIndex = header.indexOf('"kid":"') + 7;
    let kidRightIndex = header.indexOf('",', kidLeftIndex);
    kidRightIndex = kidRightIndex >= 0 ? kidRightIndex : header.indexOf('"}', kidLeftIndex);

    const iatLeftIndex = payload.indexOf('"iat":') + 6;
    const expLeftIndex = payload.indexOf('"exp":') + 6;

    const subLeftIndex = payload.indexOf('"sub":"') + 7;
    let subRightIndex = payload.indexOf('",', subLeftIndex);
    subRightIndex = subRightIndex >= 0 ? subRightIndex : payload.indexOf('"}', subLeftIndex);

    const audLeftIndex = payload.indexOf('"aud":"') + 7;
    let audRightIndex = payload.indexOf('",', audLeftIndex);
    audRightIndex = audRightIndex >= 0 ? audRightIndex : payload.indexOf('"}', audLeftIndex);

    const nonceLeftIndex = payload.indexOf('"nonce":"') + 9;

    const data = solidityPack(
      [
        "uint32",
        "uint32",
        "uint32",
        "uint32",
        "uint32",
        "uint32",
        "uint32",
        "uint32",
        "uint32",
        "uint32",
        "uint32",
        "uint32",
        "bytes",
        "uint32",
        "bytes",
        "uint32",
        "bytes",
      ],
      [
        issLeftIndex,
        issRightIndex,
        kidLeftIndex,
        kidRightIndex,
        subLeftIndex,
        subRightIndex,
        audLeftIndex,
        audRightIndex,
        nonceLeftIndex,
        iatLeftIndex,
        expLeftIndex,
        toUtf8Bytes(header).length,
        toUtf8Bytes(header),
        toUtf8Bytes(payload).length,
        toUtf8Bytes(payload),
        signature.length,
        signature,
      ]
    );
    const [succ, , issHash, subHash, nonceHash] = await openID.callStatic.validateAccessToken(0, data);
    expect(succ).to.true;
    expect(issHash).to.equals(keccak256(toUtf8Bytes(OPENID_ISSUER)));
    expect(subHash).to.equals(keccak256(toUtf8Bytes(sub)));
    expect(nonceHash).to.equals(keccak256(toUtf8Bytes(constants.HashZero)));
  });
});
