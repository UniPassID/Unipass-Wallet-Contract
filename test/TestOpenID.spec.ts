import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { Contract } from "ethers";
import { hexlify, solidityPack, toUtf8Bytes } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { Deployer } from "./utils/deployer";

describe("Test Open ID", function () {
  let openID: Contract;
  let signer: SignerWithAddress;
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
  });

  it("Verify Open ID Should Success", async () => {
    const header = JSON.stringify(
      JSON.parse(
        `{
          "alg": "RS256",
          "kid": "77cc0ef4c7181cf4c0dcef7b60ae28cc9022c76b",
          "typ": "JWT"
        }`
      )
    );
    const payload = JSON.stringify(
      JSON.parse(
        `{
          "iss": "https://accounts.google.com",
          "azp": "407408718192.apps.googleusercontent.com",
          "aud": "407408718192.apps.googleusercontent.com",
          "sub": "104331660410164053021",
          "at_hash": "A0Zv-6rRrH-WQEfJZ4P--g",
          "nonce": "Hello-UniPass",
          "iat": 1666947794,
          "exp": 1666951394,
          "jti": "1645661f9a9fc55b384d6fd171ccf51715fd4055"
        }`
      )
    );

    const signature = Buffer.from(
      "gnla3zOnCSqbf_Ap_42aywqkVj0UiUzbHajI7B7A3JPET3S5JvFNVL-Hdx1LInKtVxdzL-znFL5jn68cYBb2ECz4XB_7x_PajZ4XBJ6ly925Es326bqAuMgaI_bX6PCr_Nii_OM38vfG7SwFK1TVsqbwgNDLt2QGtWTZRBIjkYusQlyCOzAVIf76UaNIEJh9gYvIBBy5e-B6ww4x0-oZ7CAz7pozeUgjNDXUFxQKDHLcB4K5S2LncqziMVvEJCktu0KuIMXu7c6ib1O5YUlsMguNY0aw5n6CyCZlJZS1c_UPr3cH7hBJ6r5KuDJ0RNg6_rH_q-Y83pwNxRcOgS-6Fg",
      "base64"
    );
    const issLeftIndex = payload.indexOf('"iss":"') + 7;
    const issRightIndex = payload.indexOf('",', issLeftIndex);
    const kidLeftIndex = header.indexOf('"kid":"') + 7;
    const kidRightIndex = header.indexOf('",', kidLeftIndex);

    const iatLeftIndex = payload.indexOf('"iat":') + 6;
    const expLeftIndex = payload.indexOf('"exp":') + 6;

    const data = solidityPack(
      ["uint32", "uint32", "uint32", "uint32", "uint32", "uint32", "uint32", "bytes", "uint32", "bytes", "uint32", "bytes"],
      [
        issLeftIndex,
        issRightIndex,
        kidLeftIndex,
        kidRightIndex,
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
    const succ = await openID.callStatic.validateIDToken(0, data);
    expect(succ).to.true;
  });
});
