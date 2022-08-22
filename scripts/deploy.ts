import { BigNumber, ContractFactory, providers } from "ethers";
import { ethers, network, run, tenderly } from "hardhat";
import ora from "ora";
import fs from "fs";
import { Deployer } from "../test/utils/deployer";

const DkimKeysAdmin: string = "0x4d802eb3F2027Ae2d22daa101612BAe022a849Dc";
const WhiteListAdmin: string = "0xd2bef91743Db86f6c4a621542240400e9C171f0b";

const prompt = ora();
const provider = new providers.Web3Provider(network.provider.send);
const signer = provider.getSigner();
const txParams = {
  gasLimit: 10000000,
  gasPrice: BigNumber.from(10).pow(9).mul(16),
};

const buildNetworkJson = (...contracts: { name: string; address: string }[]) => {
  return contracts.map((c) => ({
    contractName: c.name,
    address: c.address,
  }));
};

const attempVerify = async <T extends ContractFactory>(name: string, _: T, address: string, ...args: Parameters<T["deploy"]>) => {
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
  const instance = 0;
  prompt.info(`Network Name:           ${network.name}`);
  prompt.info(`Gas Price:              ${gasPrice}`);
  prompt.info(`Local Deployer Address: ${await signer.getAddress()}`);
  prompt.info(`Local Deployer Balance: ${await signer.getBalance()}`);
  prompt.info(`Deploy Instance: ${instance}`);

  txParams.gasPrice = gasPrice;

  const deployer = await new Deployer(signer).init();

  const DkimKeys = await ethers.getContractFactory("DkimKeys");
  let dkimKeys = await deployer.deployContract(DkimKeys, instance, txParams, DkimKeysAdmin);

  const WhiteList = await ethers.getContractFactory("ModuleWhiteList");
  const whiteList = await deployer.deployContract(WhiteList, instance, txParams, WhiteListAdmin);

  prompt.start("Start To Proxy DkimKeys");
  const ERC1967 = await ethers.getContractFactory("ERC1967Proxy");
  const erc1967 = await deployer.deployContract(ERC1967, instance, txParams, dkimKeys.address, "0x");
  dkimKeys = dkimKeys.attach(erc1967.address);
  prompt.succeed();

  const ModuleMainUpgradable = await ethers.getContractFactory("ModuleMainUpgradable");
  const moduleMainUpgradable = await deployer.deployContract(
    ModuleMainUpgradable,
    instance,
    txParams,
    dkimKeys.address,
    whiteList.address
  );

  prompt.start("Start To Deploy Proxy WhiteList And Add ModuleMainUpgradable To WhiteList");
  if (!(await whiteList.isImplementationWhiteList(moduleMainUpgradable.address))) {
    await whiteList.updateImplementationWhiteList(moduleMainUpgradable.address, true);
  }
  prompt.succeed();

  const ModuleMain = await ethers.getContractFactory("ModuleMain");
  const moduleMain = await deployer.deployContract(
    ModuleMain,
    0,
    txParams,
    deployer.singleFactoryContract.address,
    moduleMainUpgradable.address,
    dkimKeys.address,
    whiteList.address
  );

  const ModuleGuest = await ethers.getContractFactory("ModuleGuest");
  const moduleGuest = await deployer.deployContract(ModuleGuest, 0, txParams);

  prompt.start(`writing deployment information to ${network.name}.json`);
  fs.writeFileSync(
    `./networks/${network.name}.json`,
    JSON.stringify(
      buildNetworkJson(
        {
          name: "DkimKeys",
          address: dkimKeys.address,
        },
        {
          name: "ModuleWhiteList",
          address: whiteList.address,
        },
        { name: "ModuleMain", address: moduleMain.address },
        { name: "ModuleMainUpgradable", address: moduleMainUpgradable.address },
        { name: "ModuleGuest", address: moduleGuest.address }
      ),
      null,
      2
    )
  );
  prompt.succeed();

  prompt.start(`verifying contracts`);

  await attempVerify("DkimKeys", DkimKeys, dkimKeys.address, DkimKeysAdmin);
  await attempVerify("ModuleWhiteList", WhiteList, whiteList.address, WhiteListAdmin);
  await attempVerify(
    "ModuleMainUpgradable",
    ModuleMainUpgradable,
    moduleMainUpgradable.address,
    dkimKeys.address,
    whiteList.address
  );
  await attempVerify(
    "ModuleMain",
    ModuleMain,
    moduleMain.address,
    deployer.singleFactoryContract.address,
    moduleMainUpgradable.address,
    dkimKeys.address,
    whiteList.address
  );
  await attempVerify("ModuleGuest", ModuleGuest, moduleGuest.address);

  prompt.succeed();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
