import { BigNumber, ContractFactory, providers } from "ethers";
import { ethers, network, run, tenderly } from "hardhat";
import ora from "ora";
import fs from "fs";
import { Deployer } from "../test/utils/deployer";

const DkimKeysAdmin: string = "0x4d802eb3F2027Ae2d22daa101612BAe022a849Dc";

const prompt = ora();
const provider = new providers.Web3Provider(network.provider.send);
const signer = provider.getSigner();
const txParams = {
  gasLimit: 10000000,
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
  _: T,
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

  const deployer = await new Deployer(signer).init();

  const DkimKeys = await ethers.getContractFactory("DkimKeys");
  const dkimKeys = await deployer.deployContract(
    DkimKeys,
    0,
    txParams,
    DkimKeysAdmin
  );

  const ModuleMainUpgradable = await ethers.getContractFactory(
    "ModuleMainUpgradable"
  );
  const moduleMainUpgradable = await deployer.deployContract(
    ModuleMainUpgradable,
    0,
    txParams,
    dkimKeys.address
  );

  const ModuleMain = await ethers.getContractFactory("ModuleMain");
  const moduleMain = await deployer.deployContract(
    ModuleMain,
    0,
    txParams,
    deployer.singleFactoryContract.address,
    moduleMainUpgradable.address,
    dkimKeys.address
  );

  const ModuleGuest = await ethers.getContractFactory("ModuleGuest");
  const moduleGuest = await deployer.deployContract(ModuleGuest, 0, txParams);

  prompt.start(`writing deployment information to ${network.name}.json`);
  fs.writeFileSync(
    `./networks/${network.name}.json`,
    JSON.stringify(
      buildNetworkJson(
        { name: "ModuleMain", address: moduleMain.address },
        { name: "ModuleMainUpgradable", address: moduleMainUpgradable.address },
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

  await attempVerify("DkimKeys", DkimKeys, dkimKeys.address, DkimKeysAdmin);
  await attempVerify(
    "ModuleMainUpgradable",
    ModuleMainUpgradable,
    moduleMainUpgradable.address,
    deployer.singleFactoryContract.address
  );
  await attempVerify(
    "ModuleMain",
    ModuleMain,
    moduleMain.address,
    deployer.singleFactoryContract.address,
    moduleMainUpgradable.address,
    dkimKeys.address
  );
  await attempVerify("ModuleGuest", ModuleGuest, moduleGuest.address);

  prompt.succeed();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
