import { BigNumber, Contract, providers, Wallet } from "ethers";
import { ethers, network } from "hardhat";
import ora from "ora";
import fs from "fs";
import { Deployer } from "../test/utils/deployer";
import { expect } from "chai";
import { defaultAbiCoder, parseEther } from "ethers/lib/utils";

const networkName = network.name;
let DkimKeysAdmin: string = "";
let WhiteListAdmin: string = "";
let OpenIDAdmin: string = "";
let DkimZKAmin: string = "";
if (networkName.includes("testnet")) {
  DkimKeysAdmin = new Wallet(process.env.DKIM_KEYS_ADMIN!).address;
  WhiteListAdmin = new Wallet(process.env.DKIM_KEYS_ADMIN!).address;
  OpenIDAdmin = new Wallet(process.env.DKIM_KEYS_ADMIN!).address;
  DkimZKAmin = new Wallet(process.env.DKIM_KEYS_ADMIN!).address;
} else {
  DkimKeysAdmin = "0xb80D25a543241fb4dBf6bb219D80835400Df704f";
  WhiteListAdmin = "0xb80D25a543241fb4dBf6bb219D80835400Df704f";
  OpenIDAdmin = "0xb80D25a543241fb4dBf6bb219D80835400Df704f";
  DkimZKAmin = "0xb80D25a543241fb4dBf6bb219D80835400Df704f";
}

const IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

const prompt = ora();
const provider = new providers.Web3Provider(network.provider.send);
const signer = provider.getSigner();
const txParams = {
  gasLimit: 500000,
  gasPrice: BigNumber.from(10).pow(9).mul(16),
};

const buildNetworkJson = (...contracts: { name: string; address: string }[]) => {
  return contracts.map((c) => ({
    contractName: c.name,
    address: c.address,
  }));
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

  const DkimZK = await ethers.getContractFactory("DkimZK");
  const dkimZK = (await deployer.deployContract(DkimZK, instance, txParams, DkimZKAmin)).connect(
    new Wallet(process.env.DKIM_ZK_ADMIN!, provider)
  );

  const DkimKeys = await ethers.getContractFactory("DkimKeys");
  const nativeDkimKeys = await deployer.deployContract(DkimKeys, instance, txParams, DkimKeysAdmin, dkimZK.address);

  prompt.start("Start To Proxy DkimKeys");
  const ERC1967 = await ethers.getContractFactory("ERC1967Proxy");
  const calldata = DkimKeys.interface.encodeFunctionData("initialize");
  const dkimKeyserc1967 = await deployer.deployContract(ERC1967, instance, txParams, nativeDkimKeys.address, calldata);
  const dkimKeys = nativeDkimKeys.attach(dkimKeyserc1967.address);
  prompt.succeed();

  const OpenID = await ethers.getContractFactory("OpenID");
  const nativeOpenID = await deployer.deployContract(OpenID, instance, txParams, OpenIDAdmin);

  prompt.start("Start To Proxy OpenID");
  const openIDerc1967 = await deployer.deployContract(ERC1967, instance, txParams, nativeOpenID.address, calldata);
  const openID = nativeOpenID.attach(openIDerc1967.address).connect(new Wallet(process.env.OPENID_ADMIN!).connect(provider));
  if (network.name.includes("platon")) {
    prompt.info!("Start To Attach OpenIDBlockMillisecond Address");
    const OpenIDBlockMillisecond = await ethers.getContractFactory("OpenIDBlockMillisecond");
    const nativeOpenIDBlockMillisecond = await deployer.deployContract(OpenIDBlockMillisecond, instance, txParams, OpenIDAdmin);
    const currentImplementation = defaultAbiCoder.decode(
      ["address"],
      await provider.getStorageAt(openID.address, IMPLEMENTATION_SLOT)
    )[0];
    if (currentImplementation !== nativeOpenIDBlockMillisecond.address) {
      const ret = await openID.upgradeTo(nativeOpenIDBlockMillisecond.address);
      const receipt = await ret.wait();
      expect(receipt.status).to.equals(1);
      expect(openIDerc1967.get);
    }
  }
  prompt.succeed();

  const WhiteList = await ethers.getContractFactory("ModuleWhiteList");
  const whiteList = (await deployer.deployContract(WhiteList, instance, txParams, WhiteListAdmin)).connect(
    new Wallet(process.env.WHITE_LIST_ADMIN!).connect(provider)
  );

  const ModuleMainUpgradable = await ethers.getContractFactory("ModuleMainUpgradable");
  const moduleMainUpgradable = await deployer.deployContract(
    ModuleMainUpgradable,
    instance,
    txParams,
    dkimKeys.address,
    openID.address,
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
    openID.address,
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
  prompt.succeed();

  if (network.name === "hardhat") {
    const ModuleMainGasEstimator = await ethers.getContractFactory("ModuleMainGasEstimator");
    prompt.start("writing gas estimating code information to moduleMainGasEstimatorCode");
    const moduleMainGasEstimator = await deployer.deployContract(
      ModuleMainGasEstimator,
      instance,
      txParams,
      dkimKeys.address,
      openID.address,
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
      dkimKeys.address,
      openID.address,
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
          name: "DkimZK",
          address: dkimZK.address,
        },
        {
          name: "DkimKeys",
          address: dkimKeys.address,
        },
        {
          name: "OpenID",
          address: openID.address,
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
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
