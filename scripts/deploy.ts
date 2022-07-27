import { UniversalDeployer } from "@0xsequence/deployer";
import { BigNumber, ContractFactory, providers } from "ethers";
import { network, run, tenderly } from "hardhat";
import ora from "ora";
import fs from "fs";
import {
  DkimKeys__factory,
  Factory__factory,
  ModuleMain__factory,
} from "../typechain";

const DkimKeysAdmin: string = "0x4d802eb3F2027Ae2d22daa101612BAe022a849Dc";

const prompt = ora();
const provider = new providers.Web3Provider(network.provider.send);
const signer = provider.getSigner();
const universalDeployer = new UniversalDeployer(network.name, signer.provider);
const txParams = {
  gasLimit: 6000000,
  gasPrice: BigNumber.from(10).pow(9).mul(16),
};

const buildNetworkJson = (
  ...contracts: { name: string; address: string }[]
) => {
  return contracts.map((c) => ({
    contractName: c.name,
    address: c.address,
  }));
};

const attempVerify = async <T extends ContractFactory>(
  name: string,
  _: new () => T,
  address: string,
  ...args: Parameters<T["deploy"]>
) => {
  try {
    await run("verify:verify", {
      address: address,
      constructorArguments: args,
    });
  } catch {}

  try {
    await tenderly.verify({
      name: name,
      address: address,
    });
  } catch {}
};

async function main() {
  const gasPrice = (await provider.getFeeData()).gasPrice?.mul(12).div(10);
  if (gasPrice === undefined) {
    throw new Error("Cannot Get Gas Price");
  }
  prompt.info(`Network Name:           ${network.name}`);
  prompt.info(`Gas Price:              ${gasPrice}`);
  prompt.info(`Local Deployer Address: ${await signer.getAddress()}`);
  prompt.info(`Local Deployer Balance: ${await signer.getBalance()}`);

  txParams.gasPrice = gasPrice;
  const factory = await universalDeployer.deploy(
    "Factory",
    Factory__factory,
    txParams
  );

  const moduleMain = await universalDeployer.deploy(
    "ModuleMain",
    ModuleMain__factory,
    txParams,
    0,
    factory.address
  );

  const dkimKeys = await universalDeployer.deploy(
    "DkimKeys",
    DkimKeys__factory,
    txParams,
    0,
    DkimKeysAdmin
  );

  const moduleGuest = await universalDeployer.deploy(
    "ModuleGuest",
    ModuleMain__factory,
    txParams,
    0,
    factory.address
  );

  prompt.start(`writing deployment information to ${network.name}.json`);
  fs.writeFileSync(
    `./networks/${network.name}.json`,
    JSON.stringify(
      buildNetworkJson(
        { name: "Factory", address: factory.address },
        { name: "ModuleMain", address: moduleMain.address },
        {
          name: "DkimKeys",
          address: dkimKeys.address,
        },
        { name: "ModuleGuest", address: moduleGuest.address }
      ),
      null,
      2
    )
  );
  prompt.succeed();

  prompt.start(`verifying contracts`);

  await attempVerify("Factory", Factory__factory, factory.address);
  await attempVerify(
    "ModuleMain",
    ModuleMain__factory,
    moduleMain.address,
    factory.address
  );
  await attempVerify(
    "DkimKeys",
    DkimKeys__factory,
    dkimKeys.address,
    DkimKeysAdmin
  );
  await attempVerify(
    "ModuleGuest",
    ModuleMain__factory,
    moduleGuest.address,
    factory.address
  );

  prompt.succeed();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
