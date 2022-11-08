import { keccak256, parseUnits, solidityPack, toUtf8Bytes } from "ethers/lib/utils";
import { Contract, providers, Wallet } from "ethers";
import { ethers, network } from "hardhat";
import { expect } from "chai";

const provider = new providers.Web3Provider(network.provider.send);

async function main() {
  const contractFactory = await ethers.getContractFactory("OpenID");
  const openID = new Contract(
    "0x0E12aDcD52376614A14653f389801B7E25887aE5",
    contractFactory.interface,
    new Wallet(process.env.OPENID_ADMIN!, provider)
  );

  for (const { iss, audience } of [
    {
      iss: "https://accounts.google.com",
      audience: "1076249686642-g0d42524fhdirjeho0t6n3cjd7pulmns.apps.googleusercontent.com",
    },
    {
      iss: "https://dev-mn6rjgwhgyiuyy7d.us.auth0.com/",
      audience: "vr6KIghxCqmElpAd4TND0nrMBiAR3X2m",
    },
  ]) {
    await addOpenIDAudience(openID, iss, audience);
  }
}

async function addOpenIDAudience(openID: Contract, issuer: string, audience: string) {
  const key = keccak256(solidityPack(["bytes", "bytes"], [toUtf8Bytes(issuer), toUtf8Bytes(audience)]));
  if (!(await openID.isAudienceValid(key))) {
    const ret = await (await openID.addOpenIDAudience(key)).wait();
    expect(ret.status).to.equals(1);
  }
}

main();
