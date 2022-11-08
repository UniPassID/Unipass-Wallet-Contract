import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { constants, Contract } from "ethers";
import { hexlify, keccak256, randomBytes, solidityPack, toUtf8Bytes } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { Deployer } from "./utils/deployer";
import * as jose from "jose";
import NodeRSA from "node-rsa";
import { expect } from "chai";
import { OPENID_AUDIENCE, OPENID_ISSUER, OPENID_KID } from "./utils/common";
import base64url from "base64url";

describe("Test Open ID", function () {
  let openID: Contract;
  let signer: SignerWithAddress;
  let jwt: string;
  let privateKey: jose.KeyLike;
  let nodeRsa: NodeRSA;
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

    nodeRsa = new NodeRSA({ b: 2048 });
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
      .setJti("Test 中文")
      .setExpirationTime("2h")
      .setIssuedAt(Date.now() / 1000 - 300)
      .setSubject(sub)
      .sign(privateKey);
  });

  function indexOfSubArray(array: Uint8Array, subArray: Uint8Array, start: number = 0): number {
    return array.findIndex((_, i) => {
      return i >= start && Buffer.compare(array.subarray(i, i + subArray.length), subArray) === 0;
    });
  }

  it("Verify Open ID Should Success", async () => {
    const [headerBase64, payloadBase64, signatureBase64] = jwt.split(".");
    const header = toUtf8Bytes(base64url.decode(headerBase64));
    const payload = toUtf8Bytes(base64url.decode(payloadBase64));
    const signature = base64url.toBuffer(signatureBase64);

    const issLeftIndex = indexOfSubArray(payload, toUtf8Bytes('"iss":"')) + 7;
    const fieldEndValue = toUtf8Bytes('",');
    const objEndValue = toUtf8Bytes('"}');
    let issRightIndex = indexOfSubArray(payload, fieldEndValue, issLeftIndex);
    issRightIndex = issRightIndex >= 0 ? issRightIndex : indexOfSubArray(payload, objEndValue, issLeftIndex);
    const kidKey = toUtf8Bytes('"kid":"');
    const kidLeftIndex = indexOfSubArray(header, kidKey) + 7;
    let kidRightIndex = indexOfSubArray(header, fieldEndValue, kidLeftIndex);
    kidRightIndex = kidRightIndex >= 0 ? kidRightIndex : indexOfSubArray(header, objEndValue, kidLeftIndex);

    const iatLeftIndex = indexOfSubArray(payload, toUtf8Bytes('"iat":')) + 6;
    const expLeftIndex = indexOfSubArray(payload, toUtf8Bytes('"exp":')) + 6;

    const subLeftIndex = indexOfSubArray(payload, toUtf8Bytes('"sub":"')) + 7;
    let subRightIndex = indexOfSubArray(payload, fieldEndValue, subLeftIndex);
    subRightIndex = subRightIndex >= 0 ? subRightIndex : indexOfSubArray(payload, objEndValue, subLeftIndex);

    const audLeftIndex = indexOfSubArray(payload, toUtf8Bytes('"aud":"')) + 7;
    let audRightIndex = indexOfSubArray(payload, fieldEndValue, audLeftIndex);
    audRightIndex = audRightIndex >= 0 ? audRightIndex : indexOfSubArray(payload, objEndValue, audLeftIndex);

    const nonceLeftIndex = indexOfSubArray(payload, toUtf8Bytes('"nonce":"')) + 9;

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
        header.length,
        header,
        payload.length,
        payload,
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
