import { expect } from "chai";
import { BigNumber, providers } from "ethers";
import { ethers, network } from "hardhat";
import { Deployer } from "../test/utils/deployer";
import * as fs from "fs";
import { getKeysetHash } from "../test/utils/common";
import { KeySecp256k1Address } from "../test/utils/key";

const provider = new providers.Web3Provider(network.provider.send);
const signer = provider.getSigner();
const networkName = network.name;
const networks = fs.readFileSync(`${__dirname}/../networks/${networkName}.json`);
let OPENID_ADDRESS = "";
let DKIMZK_ADDRESS = "";
let DKIM_KEYS_ADDRESS = "";
let WHITE_LIST_ADDRESS = "";
let MODULE_MAIN_UPGRADABLE_ADDRESS = "";
let MODULE_MAIN_ADDRESS = "";

const txParams = {
  gasLimit: 6000000,
  gasPrice: BigNumber.from(10).pow(9).mul(16),
};

for (const { contractName, address } of JSON.parse(networks.toString())) {
  switch (contractName) {
    case "OpenID": {
      OPENID_ADDRESS = address;
      break;
    }
    case "DkimZK": {
      DKIMZK_ADDRESS = address;
      break;
    }
    case "DkimKeys": {
      DKIM_KEYS_ADDRESS = address;
      break;
    }
    case "ModuleWhiteList": {
      WHITE_LIST_ADDRESS = address;
      break;
    }
    case "ModuleMainUpgradable": {
      MODULE_MAIN_UPGRADABLE_ADDRESS = address;
      break;
    }
    case "ModuleMain": {
      MODULE_MAIN_ADDRESS = address;
      break;
    }
    default:
      break;
  }
}

const operateKey =
  process.env.CHAIN === "test"
    ? "0xBAAF7Bc749Bba6867F28B30CDec99c0160a6Fc22"
    : process.env.CHAIN === "testnet"
    ? "0xC06495B106de8a0701ff5e84D9F8A5c9d711B1B6"
    : process.env.CHAIN === "mainnet_test"
    ? "0x1A43b5eA18Ef616d84701BA413d823fC27c771dE"
    : process.env.CHAIN === "mainet_prod"
    ? "0xaD42bA6dc4BAdd21B3A237FAe62321284fCB06bC"
    : "";

expect(OPENID_ADDRESS).not.equals("");
expect(DKIMZK_ADDRESS).not.equals("");
expect(DKIM_KEYS_ADDRESS).not.equals("");
expect(WHITE_LIST_ADDRESS).not.equals("");
expect(MODULE_MAIN_UPGRADABLE_ADDRESS).not.equals("");
async function main() {
  const gasPrice = (await provider.getFeeData()).gasPrice?.mul(12).div(10);
  if (gasPrice === undefined) {
    throw new Error("Cannot Get Gas Price");
  }
  txParams.gasPrice = gasPrice;
  let deployer = new Deployer(signer);
  const ModuleMain = await ethers.getContractFactory("ModuleMain");
  let keysetHash = getKeysetHash([
    new KeySecp256k1Address("0xb80D25a543241fb4dBf6bb219D80835400Df704f", {
      ownerWeight: 100,
      assetsOpWeight: 0,
      guardianWeight: 0,
    }),
    new KeySecp256k1Address(operateKey, {
      ownerWeight: 0,
      assetsOpWeight: 100,
      guardianWeight: 0,
    }),
  ]);
  const contract = await deployer.deployProxyContract(ModuleMain.interface, MODULE_MAIN_ADDRESS, keysetHash, txParams);
  console.log("address: ", contract.address);
}
main();
