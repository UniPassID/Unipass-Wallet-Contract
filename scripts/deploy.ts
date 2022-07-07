const { ethers } = require("hardhat");

const DkimKeysAdmin = "0x459De0f95F21A5670393F9e38645e9FB315e73B4";

async function main() {
  const Factory = await ethers.getContractFactory("Factory");
  const factory = await Factory.deploy();
  console.log("factory address: ", factory.address);

  const ModuleMain = await ethers.getContractFactory("ModuleMain");
  const moduleMain = await ModuleMain.deploy(factory.address);
  console.log("module main address: ", moduleMain.address);

  const DkimKeys = await ethers.getContractFactory("DkimKeys");
  const dkimKeys = await DkimKeys.deploy(DkimKeysAdmin);
  console.log("dkimKeys address: ", dkimKeys.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
