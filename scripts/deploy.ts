import { BigNumber, Contract, ContractFactory, providers, Wallet } from "ethers";
import { ethers, network, run, tenderly } from "hardhat";
import ora from "ora";
import fs from "fs";
import { Deployer } from "../test/utils/deployer";
import { expect } from "chai";
import { formatBytes32String, parseEther, solidityPack } from "ethers/lib/utils";
import NodeRSA from "node-rsa";

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
  const gasEstimatingInstance = 10001;
  prompt.info(`Network Name:           ${network.name}`);
  prompt.info(`Gas Price:              ${gasPrice}`);
  prompt.info(`Local Deployer Address: ${await signer.getAddress()}`);
  prompt.info(`Local Deployer Balance: ${await signer.getBalance()}`);
  prompt.info(`Deploy Instance: ${instance}`);
  prompt.info(`Gas Estimating Dkim Keys Instance: ${gasEstimatingInstance}`);

  txParams.gasPrice = gasPrice;

  const deployer = await new Deployer(signer).init();

  const DkimKeys = await ethers.getContractFactory("DkimKeys");
  const nativeDkimKeys = await deployer.deployContract(DkimKeys, instance, txParams, DkimKeysAdmin);

  prompt.start("Start To Proxy DkimKeys");
  const ERC1967 = await ethers.getContractFactory("ERC1967Proxy");
  const calldata = DkimKeys.interface.encodeFunctionData("initialize");
  const erc1967 = await deployer.deployContract(ERC1967, instance, txParams, nativeDkimKeys.address, calldata);
  const dkimKeys = nativeDkimKeys.attach(erc1967.address);
  prompt.succeed();

  prompt.start("Start To Proxy Gas Estimating DkimKeys");
  const gasEstimatingErc1967 = await deployer.deployContract(
    ERC1967,
    gasEstimatingInstance,
    txParams,
    nativeDkimKeys.address,
    calldata
  );
  const gasEstimatingDkimKeys = nativeDkimKeys
    .attach(gasEstimatingErc1967.address)
    .connect(new Wallet(process.env.DKIM_KEYS_ADMIN!).connect(provider));
  const keyServer = solidityPack(["bytes32", "bytes32"], [formatBytes32String("s2055"), formatBytes32String("unipass.com")]);
  if ((await gasEstimatingDkimKeys.getDKIMKey(keyServer)) !== "0x") {
    const unipassPrivateKey = new NodeRSA();
    unipassPrivateKey.importKey(process.env.UNIPASS_PRIVATE_KEY!);
    const ret = await (
      await gasEstimatingDkimKeys.updateDKIMKey(keyServer, unipassPrivateKey.exportKey("components-public").n.subarray(1))
    ).wait();
    expect(ret.status).to.equals(1);
  }
  prompt.succeed();

  const WhiteList = await ethers.getContractFactory("ModuleWhiteList");
  const whiteList = await (
    await deployer.deployContract(WhiteList, instance, txParams, WhiteListAdmin)
  ).connect(new Wallet(process.env.WHITE_LIST_ADMIN!).connect(provider));

  const ModuleMainUpgradable = await ethers.getContractFactory("ModuleMainUpgradable");
  const moduleMainUpgradable = await deployer.deployContract(
    ModuleMainUpgradable,
    instance,
    txParams,
    dkimKeys.address,
    whiteList.address
  );

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

  const GasEstimator = await ethers.getContractFactory("GasEstimator");
  const gasEstimator = await deployer.deployContract(GasEstimator, 0, txParams);

  const FeeEstimator = await ethers.getContractFactory("FeeEstimator");
  const feeEstimator = await deployer.deployContract(FeeEstimator, 0, txParams);

  prompt.start("Start to Initalize White List");
  if (network.name === "hardhat") {
    const ret = await (await signer.sendTransaction({ to: WhiteListAdmin, value: parseEther("1") })).wait();
    expect(ret.status).to.equals(1);
  }
  await addImplementationWhiteList(whiteList, moduleMainUpgradable.address);
  prompt.succeed();

  if (network.name === "hardhat") {
    const ModuleMainGasEstimator = await ethers.getContractFactory("ModuleMainGasEstimator");
    prompt.start("writing gas estimating code information to moduleMainGasEstimatorCode");
    const moduleMainGasEstimator = await deployer.deployContract(
      ModuleMainGasEstimator,
      instance,
      txParams,
      gasEstimatingDkimKeys.address,
      whiteList.address,
      moduleMain.address,
      true
    );
    fs.writeFileSync("./networks/moduleMainGasEstimatorCode", await provider.getCode(moduleMainGasEstimator.address));
    prompt.succeed();
    prompt.start("writing gas estimating code information to moduleMainUpgradableGasEstimatorCode");
    const moduleMainUpgradableGasEstimator = await deployer.deployContract(
      ModuleMainGasEstimator,
      instance,
      txParams,
      gasEstimatingDkimKeys.address,
      whiteList.address,
      moduleMainUpgradable.address,
      false
    );
    fs.writeFileSync(
      "./networks/moduleMainUpgradableGasEstimatorCode",
      await provider.getCode(moduleMainUpgradableGasEstimator.address)
    );
    prompt.succeed();
  }

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
        { name: "ModuleGuest", address: moduleGuest.address },
        { name: "GasEstimator", address: gasEstimator.address },
        { name: "FeeEstimator", address: feeEstimator.address }
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
  await attempVerify("GasEstimator", GasEstimator, gasEstimator.address);
  await attempVerify("FeeEstimator", FeeEstimator, feeEstimator.address);

  prompt.succeed();
}

async function addHookWhiteList(whiteList: Contract, addr: string) {
  if (!(await whiteList.isHookWhiteList(addr))) {
    const ret = await (await whiteList.updateHookWhiteList(addr, true)).wait();
    expect(ret.status).to.equals(1);
  }
}

async function addImplementationWhiteList(whiteList: Contract, addr: string) {
  if (!(await whiteList.isImplementationWhiteList(addr))) {
    const ret = await (await whiteList.updateImplementationWhiteList(addr, true)).wait();
    expect(ret.status).to.equals(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
