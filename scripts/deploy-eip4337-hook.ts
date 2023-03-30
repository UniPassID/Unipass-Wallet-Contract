import { expect } from "chai";
import { BigNumber, Contract, Signer, Wallet, providers } from "ethers";
import { ethers, network } from "hardhat";
import { Deployer } from "../test/utils/deployer";
import ora from "ora";
import * as fs from "fs";

const provider = new providers.Web3Provider(network.provider.send);
const networkName = network.name;

const ENTRY_POINT = process.env.ENTRY_POINT!;
const prompt = ora();
const instance = 0;
const paymasterAdmin: string = process.env.VERIFYING_PAYMASTER_ADMIN!;

const txParams = {
  gasLimit: 0,
  gasPrice: BigNumber.from(10).pow(9).mul(16),
};

async function main() {
  const gasPrice = (await provider.getFeeData()).gasPrice?.mul(12).div(10);
  if (gasPrice === undefined) {
    throw new Error("Cannot Get Gas Price");
  }
  txParams.gasPrice = gasPrice;
  const signer = provider.getSigner();
  let deployer = new Deployer(signer);

  prompt.info(`Network Name:           ${network.name}`);
  prompt.info(`Gas Price:              ${gasPrice}`);
  prompt.info(`Local Deployer Address: ${await signer.getAddress()}`);
  prompt.info(`Local Deployer Balance: ${await signer.getBalance()}`);
  prompt.info(`Deploy Instance: ${instance}`);

  prompt.start("Start To Deploy ModuleHookEIP4337");
  const ModuleHookEIP4337 = await ethers.getContractFactory("ModuleHookEIP4337Wallet");
  const moduleHookEIP4337 = await deployer.deployContract(ModuleHookEIP4337, instance, txParams, ENTRY_POINT);
  prompt.succeed();

  prompt.start("Start To Deploy Verifying Paymaster");
  const VerifyingPaymaster = await ethers.getContractFactory("VerifyingPaymaster");
  const verifyingPaymaster = await deployer.deployContract(VerifyingPaymaster, instance, txParams, ENTRY_POINT, paymasterAdmin);
  prompt.succeed();

  const file = `${network.name}_EIP4337${process.env.DEPLOY_MAIN ? "_deploy_main" : ""}.json`;
  prompt.start(`writing deployment information to ${file}`);
  fs.writeFileSync(
    `./networks/${file}`,
    JSON.stringify(
      buildNetworkJson(
        {
          name: "MoeulHookEIP4337",
          address: moduleHookEIP4337.address,
        },
        {
          name: "VerifyingPaymaster",
          address: verifyingPaymaster.address,
        }
      ),
      null,
      2
    )
  );
  prompt.succeed();
}
main();

const buildNetworkJson = (...contracts: { name: string; address: string }[]) => {
  return contracts.map((c) => ({
    contractName: c.name,
    address: c.address,
  }));
};
