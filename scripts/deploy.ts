import { BigNumber, Contract, providers, Wallet } from "ethers";
import { ethers, network } from "hardhat";
import ora from "ora";
import fs from "fs";
import { Deployer } from "../test/utils/deployer";
import { expect } from "chai";
import { keccak256, parseEther, sha256, solidityPack, toUtf8Bytes } from "ethers/lib/utils";

const DkimKeysAdmin: string = "0x4d802eb3F2027Ae2d22daa101612BAe022a849Dc";
const WhiteListAdmin: string = "0xd2bef91743Db86f6c4a621542240400e9C171f0b";
const OpenIDAdmin: string = "0xBbdbFaD06f7Ba642b2D666D62C3f602e147ECB12";
const DkimZKAmin: string = "0x7b0827F8B17820B5c27dCb3F761693eC98b342fE";

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

  prompt.start("Start To Init DkimZK");
  if (network.name === "hardhat") {
    const ret = await (await signer.sendTransaction({ to: DkimZKAmin, value: parseEther("1") })).wait();
    expect(ret.status).to.equals(1);
  }
  await setupSRSHash(dkimZK, "0xd74edf114bfc675d08f39d18139c8442ad1795dd0474bb7e61fc04a23694b58c");
  await setupVKHash(
    dkimZK,
    1024,
    BigNumber.from("0x0000000000000000000000000000000c"),
    BigNumber.from("0x00000000000000000000000000040000"),
    [
      "0x19ddbcaf3a8d46c15c0176fbb5b95e4dc57088ff13f4d1bd84c6bfa57dcdc0e0",
      "0x0a097ba73bcefd522500f96f1585f44c75c1eb551db26e97cff7ef0fddcdc74c",
      "0x0e2dc61c208c78de4c52f1449c9abf6d89fcd0b3e814d98f16dc4c617f39014d",
      "0x0255ee1d7021a2f31f51ce4289fb11b96ee7676e6cd8a8e6a47a5b5ad01ccb44",
      "0x2461a519a407e973947afd50b4e2d19a32137c667c1e6fb47b7c29e3093536f5",
      "0x0ceca1848489bf2ca34f76898c005527668f860204644bb23f45416c79fbca32",
      "0x13fb7e67fc44ecec48bdc3b2c1119d92e13bf35a103665e9c78e060a1a2688ae",
      "0x0be447b4566de52ccb17ffd2d6852b3354c29f15527051080f96993fc4552810",
      "0x21f47aefda59816a447cd1f048c8b3a67cb54eb91ef1d3f37409b5aba4d3b184",
      "0x17343eb61cdf49295d03c3e611c52e74215af7e951166f1c95558fa5a6d37a26",
      "0x22c7fc97c49f50b60bc206053174d31b77497827000fff9000e4c375a959646a",
      "0x29bb6c72208038f5c569cb1e21415b51f60f2994ea60832900ce5afb35f120a8",
      "0x1cc2e406f6d7b313e76a818b9edea767edd1b837fdd970f32a8452f4ad0d232d",
      "0x0a3b1026dd87a0583db4bab90ea147eb91e3acaaacda5a30f55a6bd60f642a7f",
      "0x12f3e23fc8b20eb05e9dfe38d061418b589c33091e37a036a6ddc4081523081f",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      "0x06e4a519359c5e468b2687e69953eeff563a949d35a75d29a11ef693b20b2f17",
      "0x071c71bb00f0eaded99739f9300bd071cd5c6ee4603731a3feea4f1c882de5a6",
      "0x05928792b33a44e0d6368929f65371fb15671fcc26fc9a38aaf02d9206c61343",
      "0x0aeec052df4c75137bfdd36f106cf375d9f75a2cc5a8128345986c4eaf7ca8e8",
      "0x3040c573acd130a471eb5099411debf63d9a3ec119ca48e77c9473cf0b445ee7",
      "0x07c9565f48ec36f5f8b809576e97038099a36359a9124733268df85b82f9ac8c",
      "0x162ffd75a7abe4a960c56550c37b7a4cde174c0ff2848a3908d503fc9960e91f",
      "0x177ff300e22899f117a8cbceb2d496b1cfb93e718c5ef579736616d25ec56aa7",
      "0x22a34931f8f89d82f86b60742056e3ee1a2282ce35d61072115b31396e3f0507",
      "0x04f5e8fe7a9149259fd4b13a7d2faf615fb34e00003f3a3dfe63899d6244bd02",
      "0x0b4d91a0c6327ad02cc3d2c7c88edcc447edb110b2c92a1c808f4b6e2f4e629a",
      "0x232a1bc6b9c9f69c0e413bb182c056e23467226b08e0a08209c46bb1f8ef8eb9",
      "0x18e7356b098977fb378e7295c6820fa6e5b3459c452a62034806cc2057d8c9a1",
      "0x07b93a26c1cce9bd89cdc418f5698e10e41b22dcea498d08ae7e8051d22f8a14",
      "0x2499f2c08fabd262797797b95d04b12d20751cdefa1ea0367a4de28834ef351a",
      "0x26b617aecb610e8ad0420c6c161eec989858a048b45c30eecffccdddd5dca49a",
      "0x26934eacf57074bb4b6b15cd43adcc011835d2430dd43aa8ddba996c96cbcc07",
      "0x2f9a944b4fca7adfcce4168acb0da7e64e63edc7121d046950533da20a94e71a",
      "0x1a7cf0927fb101ec5d58ee3667242a6ad1ded582d660110d5b5d9013482d086a",
      "0x2eef5bd199eb34bede3507df278d367556c355640431b90c7d66f76da6d85322",
      "0x2df100f8a7509480cdfdcbeac64d7862c466eac7b09eab6c4de06911f0da101c",
      "0x159e68fe8468236e827d2418d3fe2a38b54b82a8b5c1937e8026f2a20b4f55b9",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      "0x26ce874fa4b7709509df406eb1f5340ed6036dfbd78212ded7add264b5a03f83",
      "0x218079318feea4fa9402225e9369ffec24f3f01ea57d35b4d59148b5e9901740",
      "0x059fd0bc5d304469526ec5277c6678b3e4cbe921e85e7d710ff02a4d1b926961",
      "0x03d81f19311b549bbb043bd1f8684f0b880de123451c2ab67a9119e734e19c7e",
      "0x1cbc1d2c75b5615b69b8f40b8da14ea4bfd802636fa046777b81f4fccc3ebd79",
      "0x2eb48a850530c1bb9cf51fa8794f9b9c799c607bc0215ab04d5032c67008b74b",
      "0x01692726fe8fc8bd548084bbacf82c4b4b84d726e677a43d0425226b1f049de6",
      "0x2f9969bf4aa7ba4c75ab8276773066254a771172a421f0dc069aba75002a155c",
      "0x073544a7faa45857386f4d40063f6df57b8447599f53e94adb8de3d1bf23dd8c",
      "0x2e99d08a8067c9b3a676fc036189692c35018295651adf2f4bd8131ada006be9",
      "0x23516fbcad5dd180b5d88db543167ff199b371bba13f78b4b68ab455efd44991",
      "0x305ba413b77c578cdb63d30ee75b4ff90841756efaf642ee9f61a07cf8cbf28a",
    ]
  );
  await setupVKHash(
    dkimZK,
    2048,
    BigNumber.from("0x00000000000000000000000000000010"),
    BigNumber.from("0x00000000000000000000000000080000"),
    [
      "0x2260e724844bca5251829353968e4915305258418357473a5c1d597f613f6cbd",
      "0x1cd44b567cd81d7a2b7aabf5c62dff7b10001c38aae8d7a46b8805f13c47de90",
      "0x1b69ec11ed717f9df6c2ceee8856f30e155e4c0bd0d936fc6de00873643c077d",
      "0x2146a2c81b8cc71f54f19be9aa153b886b7e67d9d02d864b13995f8fd4c329c0",
      "0x15aab1d2d21008c42b5f9c625567000228870d261ffcf1258d96282e416f3e2a",
      "0x180b9d849018912e8afc7b42c6c28727f968045c2e716d1dc8f9ba05c06a3163",
      "0x2ff5f5018c5c32e90b1f8ea2285806fe0cdbf60f62d2d8aad097d4bca01aabd0",
      "0x0ff4ab765b314cda712a678a660f7757200c4d906c9b6d87c75505736aff354e",
      "0x0385a3bd4410913e1e08f871ce8a135424476342736f4a2ef5e6db41e7c8fb6f",
      "0x2f82646810431a7bfdd5dea4b43c07c60471023a22e9c62a65ec827bfe31a551",
      "0x0ff508f6ffb2be8a80de126155b78f97ec3302f8ee1d5bbb564d59eefa5275e4",
      "0x11126a753851bfb77e08a091840699533c957e552c0d8d7e2132790d7c094a72",
      "0x259cd451421fdbbcb83f31bf6fec2b4cb6fb99fd873482ad97da075ee53c6282",
      "0x02c9ecb11a0f3712331e82809250ec930d48e74af7f1fd8e89f2efb6833c37c8",
      "0x2f89253f931b25cbe09a898d8b91c2c785b808db48ebf000cb5c5a6980ef09c4",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      "0x175f94786c0ff29c5c23e77854fd09e610a7e8f39ad8a4f9fb8b1e28d5ca11fd",
      "0x108ffaaef821f6966f1d9566784b73c9cbf3f9a3d47bcc46e6516195badd36be",
      "0x304737450490b3e7874074cd060105c4d16e7b2e5dae66277ded314484a47be5",
      "0x0ca6591a56c4218ce2a5f882c921f3f5f3472c910bb53862eb4b88be231cb7f5",
      "0x1385c00e4c67f6e63052ab8d0a3394d9373dcb52eea72a07f53546d520475623",
      "0x0f76f4c1f3c69b5fa95b70564cbd4572bd6b2851a1a38c2d0aa053ff39aa43a1",
      "0x29b45b5c5e21975d99f4adb596467e5b658ca534038992a783bb56ed4dd74a1b",
      "0x0eb0fe84ec4991d20b8cd5ce870bbbb5ba74ded5e76198f24bd9a2b739291f2c",
      "0x03f16bf18498a169cd776f97cb60c7a5f455e9b33b6c17dad4e52a6ff8a3cac2",
      "0x218b64ddfb6f1ccb2aa400d8d5b6778384965f365a6f1cfc868dc2745c9000ee",
      "0x25a383e02dfa45028a57d8336bcea6a7f8760d671ad6b6d0428831fa6165945e",
      "0x0920e762b8bbbf8f2921842a963f556796671ecb1a6fbd7a9879d380a8e97404",
      "0x1226ee6c413e47f3943f2927420137cc312f25d127e412626ad90fec0eee3c7b",
      "0x2fdb40c7a8381204ff23a20ae1dbf806e36608a42f2c94ff5f35b0a8638560fc",
      "0x1c00a5a5d4a161172a51efa6ad00a9548a029d854925017e8349bf79ae211dfb",
      "0x0bbb952d21fd5c9f7108241ddacc1e11ac6fe4e2ec36a59f66b448437ba043df",
      "0x0bbaa129c4b86a335cfb4b2ecb3572b9b4580a838bc9fb16fd01846eb81c1e03",
      "0x155c80d7c83c5ee42cf53b6770412f6cfa1515b876824d5f485389677108dc2c",
      "0x236c5847ee61370c8447408cddb944047a61568980126c1cbc4a68e51cc7d9db",
      "0x2a894b8e7f135f7221c3cc001626ed307c269c256f6018e969c1c848ab4c5152",
      "0x1a5ae34646259797bf6612bbc031e1b64054852201119c82bbfe0dbc2caa000d",
      "0x02c10aff597fd3cad863a1cca718717db26fa2278896323d84c2a2f0e44223ff",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      "0x276344e67a2aa7331d55edfd7e1ccbc59d824ff41970abd83dc874005d505102",
      "0x28e03ec94389af27966e6c19a1739673258a4ebf95dec98ec49596bcb89b99c5",
      "0x1ebd3d1924a8f46d69607a4f936b211a26d89afee2b2689a513be744bbae2fc8",
      "0x211dcd24b30b0648894117b2055afdace0ec74100b2655d7dedd70d6c4dc0643",
      "0x2303965c7f681eac83d7e89cea4ad37c1a94aeb44b0f1bcfa7a5ff7ba2ad44b1",
      "0x1626e17b1cb93cab26dacf0e807a9ca1b11fe282ec463872b59ada546f076704",
      "0x177e59354d21edaff2af4cd4ccc8e85f8a7c846fde4cfe3289cd42a2fc4a1ed8",
      "0x030b75e2fddfce9e4527c01c756facad9459711fe94113902df94a4dfc7feaa2",
      "0x073544a7faa45857386f4d40063f6df57b8447599f53e94adb8de3d1bf23dd8c",
      "0x2e99d08a8067c9b3a676fc036189692c35018295651adf2f4bd8131ada006be9",
      "0x23516fbcad5dd180b5d88db543167ff199b371bba13f78b4b68ab455efd44991",
      "0x305ba413b77c578cdb63d30ee75b4ff90841756efaf642ee9f61a07cf8cbf28a",
    ]
  );
  prompt.succeed();

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
  await addImplementationWhiteList(whiteList, moduleMainUpgradable.address);
  prompt.succeed();

  if (network.name === "polygon_testnet") {
    prompt.start("Start to Initalize OpenID");
    const iss = "https://accounts.google.com";
    const aud = "407408718192.apps.googleusercontent.com";
    await addOpenIDAudience(openID, iss, aud);
    prompt.succeed();
  }

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

async function addOpenIDAudience(openID: Contract, issuer: string, audience: string) {
  const key = keccak256(solidityPack(["bytes", "bytes"], [toUtf8Bytes(issuer), toUtf8Bytes(audience)]));
  if (!(await openID.isAudienceValid(key))) {
    const ret = await (await openID.addOpenIDAudience(key)).wait();
    expect(ret.status).to.equals(1);
  }
}

async function setupSRSHash(dkimZK: Contract, srsHash: string) {
  const currentSRSHash = await dkimZK.srshash();
  if (currentSRSHash !== srsHash) {
    const ret = await (await dkimZK.setupSRSHash(srsHash)).wait();
    expect(ret.status).to.equals(1);
  }
}

async function setupVKHash(dkimZK: Contract, len: 1024 | 2048, inputsLen: BigNumber, domainSize: BigNumber, vkData: string[]) {
  const vkHash = sha256(solidityPack(["uint64", "uint64", "uint128", "uint256[]"], [len, inputsLen, domainSize, vkData]));
  const currentVkHash = len === 1024 ? await dkimZK.vk1024hash : await dkimZK.vk2048hash;
  if (currentVkHash !== vkHash) {
    const ret = await (await dkimZK.setupVKHash(len, inputsLen, domainSize, vkData)).wait();
    expect(ret.status).to.equals(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
