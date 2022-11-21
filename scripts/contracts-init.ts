import { hexlify, keccak256, parseEther, parseUnits, sha256, solidityPack, toUtf8Bytes } from "ethers/lib/utils";
import { BigNumber, constants, Contract, providers, Signer, Wallet } from "ethers";
import { ethers, network } from "hardhat";
import { expect } from "chai";
import base64url from "base64url";
import { LedgerSigner } from "@ethersproject/hardware-wallets";

const provider = new providers.Web3Provider(network.provider.send);
const OPENID_ADDRESS = "0x51f701e6FaF73cb20aA2b69EfcEa4e6f24478B75";
const DKIMZK_ADDRESS = "0xfB9Ee09DaC09216076ef44D632921Ecd52d07421";
const WHITE_LIST_ADDRESS = "0x93b3eDFc588EdE0a90d8bb3A59348CFCc3C4444c";
const MODULE_MAIN_UPGRADABLE_ADDRESS = "0xf7584d0e9b9D088E21798010449eD61eB4C80864";

const adminPath = "44'/60'/5'/0/0";

const txParams = {
  gasLimit: 10000000,
  gasPrice: constants.Zero,
  type: 1,
};

async function main() {
  const gasPrice = (await provider.getFeeData()).gasPrice?.mul(12).div(10);
  if (gasPrice === undefined) {
    throw new Error("Cannot Get Gas Price");
  }
  txParams.gasPrice = gasPrice;
  const signer = await getAppEth();
  await openIDInit(signer);
  await dkimZKInit(signer);
  await whiteListInit(signer);
}

async function openIDInit(signer: Signer) {
  const contractFactory = await ethers.getContractFactory("OpenID");
  const openID = new Contract(OPENID_ADDRESS, contractFactory.interface, signer);
  await openIDInitAudience(openID);
  await openIDInitPublicKey(openID);
}

async function openIDInitAudience(openID: Contract) {
  for (const { iss, audience } of [
    {
      iss: "https://accounts.google.com",
      audience: "1076249686642-g0d42524fhdirjeho0t6n3cjd7pulmns.apps.googleusercontent.com",
    },
    {
      iss: "https://auth.wallet.unipass.id/",
      audience: "vr6KIghxCqmElpAd4TND0nrMBiAR3X2m",
    },
  ]) {
    await addOpenIDAudience(openID, iss, audience);
  }
}

async function addOpenIDAudience(openID: Contract, issuer: string, audience: string) {
  const key = keccak256(solidityPack(["bytes", "bytes"], [toUtf8Bytes(issuer), toUtf8Bytes(audience)]));
  if (!(await openID.isAudienceValid(key))) {
    console.log("Add OpenID Audience Start");
    const ret = await (await openID.addOpenIDAudience(key, txParams)).wait();
    expect(ret.status).to.equals(1);
    console.log("Add OpenID Audience Success");
  } else {
    console.log("Not Need To Add OpenID Audience");
  }
}

async function openIDInitPublicKey(openID: Contract) {
  for (const { iss, kid, pubKey } of [
    {
      iss: "https://accounts.google.com",
      kid: "f451345fad08101bfb345cf642a2da9267b9ebeb",
      pubKey:
        "ppFPAZUqIVqCf_SffT6xDCXu1R7aRoT6TNT5_Q8PKxkkqbOVysJPNwliF-486VeM8KNW8onFOv0GkP0lJ2ASrVgyMG1qmlGUlKug64dMQXPxSlVUCXCPN676W5IZTvT0tD2byM_29HZXnOifRg-d7PRRvIBLSUWe-fGb1-tP2w65SOW-W6LuOjGzLNPJFYQvHyUx_uXHOCfIoSb8kaMwx8bCWvKc76yT0DG1wcygGXKuFQHW-Sdi1j_6bF19lVu30DX-jhYsNMUnGUr6g2iycQ50pWMORZqvcHVOH1bbDrWuz0b564sK0ET2B3XDR37djNQ305PxiQZaBStm-hM8Aw",
    },
    {
      iss: "https://accounts.google.com",
      kid: "713fd68c966e29380981edc0164a2f6c06c5702a",
      pubKey:
        "z8PS6saDU3h5ZbQb3Lwl_Arwgu65ECMi79KUlzx4tqk8bgxtaaHcqyvWqVdsA9H6Q2ZtQhBZivqV4Jg0HoPHcEwv46SEziFQNR2LH86e-WIDI5pk2NKg_9cFMee9Mz7f_NSQJ3uyD1pu86bdUTYhCw57DbEVDOuubClNMUV456dWx7dx5W4kdcQe63vGg9LXQ-9PPz9AL-0ZKr8eQEHp4KRfRUfngjqjYBMTFuuo38l94KR99B04Z-FboGnqYLgNxctwZ9eXbCerb9bV5-Q9Gb3zoo0x1h90tFdgmC2ZU1xcIIjHmFqJ29mSDZHYAAYtMNAeWreK4gqWJunc9o0vpQ",
    },
    {
      iss: "https://auth.wallet.unipass.id/",
      kid: "h3z2sfqPqMVBcJABJ3QQA",
      pubKey:
        "7qxWShENj3kTLXkVZN58K0h8UbaEG2cKZlzIFNqTtLrMBJCJE6Ivq0gMS0jGzflABQLuc9W53EMY5NfO5n9NDn_fsALoYdHdkvQOMwBr1v_Jp4jSua-uqFbMSBdTFqffVH3V_ClsQS3cptbpHwQ6xBL_Cbw3iJkA74tkt_N5Y8cncECISPgXi-J1hYjRVLcqaycFX6aiUChUHz6X1KBPybSQAonIYNr4291snkmL2wwo5L0NdToHAuOzEjkQM40UVU4Pjfkb7yes3q3DY_yyKM5eSGIQgunwxnrlqx-wrWhC-qrb_4gD8PgDkGWQtOaEez5H_JPTWbgnnMR440BOSw",
    },
    {
      iss: "https://auth.wallet.unipass.id/",
      kid: "uO3y4PywkyIG0iR1pdorR",
      pubKey:
        "rbn8s5fDYMcX08c0UUKpcskgVnXdMmUJYqndDcs_-_ZDLgT2CJRl9MI7CnXiSnZJ01R9aktGugH924WNtivPuQpgDNWhJX8GGFcltjx2BywRlROek-6hrH_chK4xpJIbEaprrk7iDP2PFV8C2KzOqtOU-rCLpDGYg-8e4BlSJhBBDmLqety0r42t5pGw2fkNTVZKhYbbLXD44ZaGlgr6VuLPubOTSs-lhnABIUs21yGgo-abbgOsKTUbuEmJshbxuDINwrlq4q9orPk3EDwLdNiCh50c_CgBEreWSsl6sObvWF5ZFjGwzZHQoWvZV3bHz173uWu_CTdSh5s0eUktNQ",
    },
  ]) {
    const key = keccak256(solidityPack(["bytes", "bytes"], [toUtf8Bytes(iss), toUtf8Bytes(kid)]));
    const n = base64url.toBuffer(pubKey);
    if ((await openID.callStatic.getOpenIDPublicKey(key)) !== hexlify(n)) {
      console.log("Updating OpenID Public Key");
      const ret = await (await openID.updateOpenIDPublicKey(key, n, txParams)).wait();
      expect(ret.status).to.equals(1);
    } else {
      console.log("OpenID Public Key Has Been Updated");
    }
  }
}

async function dkimZKInit(signer: Signer) {
  const contractFactory = await ethers.getContractFactory("DkimZK");
  const dkimZK = new Contract(DKIMZK_ADDRESS, contractFactory.interface, signer);
  await setupSRSHash(dkimZK, "0xb58cd3f877523a8ef8c742bc8d3a03eab3f094a587af5aa63b63be53a3a8e8f5");
  await setupVKHash(
    dkimZK,
    1024,
    BigNumber.from("0x0000000000000000000000000000000c"),
    BigNumber.from("0x00000000000000000000000000040000"),
    [
      "0x19ddbcaf3a8d46c15c0176fbb5b95e4dc57088ff13f4d1bd84c6bfa57dcdc0e0",
      "0x11cf80810f496c6020758bfa9b5edcd0de418308af054c39457db0d34262f28d",
      "0x0016d250077a3ffc53d673969c23b86fcba64666ba5ffa74db56cd2ea5e89706",
      "0x1afe4f80377d11a4b914e23b069f707a09127be4854936f04102cfad13e36824",
      "0x270b9e0fb57b26f3fffa3dca75e2aba27547668f9fc00c74b886d5617a4d8638",
      "0x0b94647adff16faefb5d499890f2e0ecfddda0f0b633df49a3a6d95127a072e9",
      "0x110b2dd04bcb4ab6946ecab6b5c5980b290d830eb97eee01c285f19a320baab9",
      "0x2063ddaf706571cc7c0b017b72961c99ad1497104122608652b58fef46aae782",
      "0x0538c947cf6167a806da482d5c5a529ffa5272d992accfc4f09b6e232f484a8d",
      "0x25662b4e815629606f2f5fafece397b396c27343e85d5e1b4f71469d0ee7e037",
      "0x1578e70d460bcf2fa738ae9672bb5b13b235c0a1042cf0c21986b9432b95efde",
      "0x123eb8f9010408cb6accac0c9fc147619087fb98110b5742605251c06cdf07d2",
      "0x2908fb7a4efc2b78fbc9ee4eb4a4c82f2faf540b71c59f4751d6294468b7ca14",
      "0x1496d2e64d1be00e576fe1b6af20064e62317f8e8add013ccf17ed0f2c6474d4",
      "0x11ac90e9c295e0b05a3c969713c9f035395b7b5ae718d999a0ae9c9a3c9aa1a8",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      "0x12f3dc55cfd4647f269c47472be78ec633fc1e7f68fda6de0cee373ccff8b9c2",
      "0x2a538024e11db53d0dc2296ff610ae0772c596e8cef4d5eb0665831893fc8d93",
      "0x02a5755e7e487fe74bdb6e812282039ad4ecebd65a7a28b6605a4722ce4a5092",
      "0x05f6642a55d0dfbcad6d5a536410c4659925de70a4dc0b20b1fa01ec924f2218",
      "0x1e8bf9067735eea60ee25d2858735332dd8e05555eaecd65f919f8127cde1d59",
      "0x1ccae21bf4448d79c3657674ea8758253af182f00993208eb364900f51567648",
      "0x02845a0bb14b0220d6d268b3efb38ac6e917d81abec70f13b94527ff94b67927",
      "0x1a28a5e0de71dd00087116796b7808fdc3f44a0b4b5726c993128b80e487f9d0",
      "0x2a821c3ca15fb23def4e2bbb6d36c4c658ac79f3ee5f9e67433f5bca19d4cb5c",
      "0x28746cd3b721638692bb2c857396e34ca629fe01b1e3fc37123bbe47d157ab6c",
      "0x0041abf559ee1bc503d263bfe40f7ed7230ace639eaec2b89371470a50073b89",
      "0x15934ff5efddac718a14760c5c66860e1a66790865b478c9f255def6d33efb1b",
      "0x117ff685d6664a185a25aba1cb14f3d46183b60732041ce149af0d02032d3c34",
      "0x088b61708af8ca4bd22d36a9a898d5435517b18f45c2619144c640c5b1c41739",
      "0x10aba646318091f8fe7b9f10736d81f0cb5a749e4509e24c1ae3e5954b48657a",
      "0x2fff2f7c05b878022d64e66a8ac1fc849af8c14100cc66d9ef1004b415d246c4",
      "0x285afb4802764562e5c344fa48c0cc083648d85172e5f3d89798c933b6d6ad41",
      "0x18ae3f5858b613ad356030fbf870c1771b84dea1577617e007cd9cb33111ea5e",
      "0x26e724bd808cc5ee276c47675729b9d02b932e7b44b69d2619e9913725fff913",
      "0x2dc4daa3afab807e0b8c129c1391f936f281046bc9f7376ad78cb482963b02da",
      "0x001982fb74c39383a3fa0a2c87e9fa3f5980f8a5e4b67e44f9e1aa9583a50f53",
      "0x163f54da1d04573552b8732c1b4813d73301c15a311486a58ca00562e781a0de",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      "0x05cb6c025492710fc1f7dc8c6de6154a66385eb1b35f1f7bce32385837eb446b",
      "0x1500e38541b3ad9ede43e25f54609b2b937aa4d48fdfebc9360107a8040c3955",
      "0x2aafd52d40938de1a21977ae17968043de28a2366cbd1bc563393c97a07b1456",
      "0x1d947c68254a8cd4138c4b5725a94b1847fd333e61a91ea203390bd7f18c8671",
      "0x000a0e6f5469addaed10aa0d19d2d6bc2f80f0ac4fb956e9e1299e88c44417b6",
      "0x0a06af4dfafba34596889c52fe2e138e85aa57c4f727def55978099b7136f992",
      "0x0526478ee28f456871ba0d8bffcb5e122ca3a0910f77a64024283f2935d4d21f",
      "0x085a03ebe41b47c81a0892076c04d1c55af0c41276f38c2315ca01e96829969b",
      "0x1738ffc8fc5b7fe03ac9be14267f02bc32df0c9150c4dcd5670f8d70f4dbae85",
      "0x2aa2ab53176480733c3a842e31d66e30ff4d4dd6aac905aee57846311fdb1622",
      "0x257b61afa0584f346bf9fe09e6a2723aa05d228e908ee622a81d5d9910eec2ca",
      "0x04eb34053ed41d8a2366c22a36bbef38e6af8344f13d822a1a320dddf664b092",
    ]
  );
  await setupVKHash(
    dkimZK,
    2048,
    BigNumber.from("0x00000000000000000000000000000010"),
    BigNumber.from("0x00000000000000000000000000080000"),
    [
      "0x2260e724844bca5251829353968e4915305258418357473a5c1d597f613f6cbd",
      "0x1e70dbe990397b32f4dddf7b0ea3b530604b92c5a6aead00535740ba5b8aaf98",
      "0x210d3a3aa99da26f923e277871b55b75ced84755104e0fdbc1f605c8384b1e86",
      "0x1cc350922de179f81e2eb49f0e59839f62e206804f0d3a8c60ed3e3846372978",
      "0x051d2543bd6efe8a256d6dfc595adca3a2770be88020bbbbfea0254f2fe203ac",
      "0x1fef71ed267dd64631812a4483519e9801ab2dada80e23a78839b9343ccda655",
      "0x142e1b091254b4c8bf2a620a1e9678252c1a72fd6ea1db14eb60fc0bd6de257f",
      "0x293861d3b0d43c531a76811de4132f2cd2fbc05150367806b5c1dd85578458a4",
      "0x213c1d52eb1c6bd66160378da36686bc605de166edf74954010f1d71d22cb3ce",
      "0x27665780ec06eea1adefeb9d9b719084eac7be4551d9bb22cfe63933b1ec4dce",
      "0x1f80e169130eca06fb3284d5be3f089983fecc2b8771fb267df0b43b2d5b0246",
      "0x0130965a0d10f2a9979c7177504daa17547c998ff20e3c05f2c502f9ab3343cb",
      "0x0fe0ce4467235cd37ea5403b3e4c470ba55479ed8a9e77e4f393bc3463a16037",
      "0x21a8b41b32a73f4bf88ae387f847712cde52f916670573661f9e94182a7cf605",
      "0x1e9d43aec9dcdfa70f3c8637ad731d49fcd9354a77f5b6ea8137048aa98a7b07",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      "0x2a3a470b644ba5eaef54f0b911393665d057bd37778e9cfd2aa89f8512b45f40",
      "0x22af26a899917146caab53a8604fa8a54d847113959307156199e13ca2cc109c",
      "0x0845d4ce1e37f51832095e34fec3ecf5abf00547954c99cd48b15c1d584b6a52",
      "0x21aaf479159e136faa94e4bc1865733116d45dbf58e513889d3ca18781e996f9",
      "0x05ddcba50dd192164b0b4ae38e34bab627a42222b25f9a1a753e911fd4420769",
      "0x10899b83f375028bcb7fb7af6f33e59523bcb692b2992af634e3de29dd2c25a7",
      "0x0a2a8bf0c5933024a7dd433ed64eddfab089a56b5163d79a32f9c204de5dd1fa",
      "0x0a2626ae3533afd543673d53787702c33ded19cd6c3463f2d8a632ceea5b8b96",
      "0x245cacae278b6a7ee4a8b98ed53f84aaec83beac34953365febb3ec82ae84ed3",
      "0x1e92a09b059cb22750a6b63f9413dc73e9e8b4beed2b116a2137f45b861ec3e8",
      "0x147b5d51e8284df1e1d96c34634f8772a0a5bbda7255298e1b937b7e751b7876",
      "0x17c2586a7e91f60551097e823b4e77128cefd5e069bda8874c2f4416e90b7406",
      "0x03427ff2099eab9572a7ceee59a4799612dd02d0301d324290b68d9a5754efe9",
      "0x0e18d9b70060cce01fc687ffa5e8d8c6291dfe9a845b48e63ea1999910077390",
      "0x080a81cfe34056016ea97dd7efe1b477c28e7f0356cf94bd60f6772776a46995",
      "0x2964e845517b3582eb5b8aa951a60b779b52168bbfbe2b4d054d7be7e8e13ba9",
      "0x1068189f24fdd94e405a82a06ab89028f18b3dd152f3cba494153adb0d5a5a2a",
      "0x0dd86f6a3e726318dc224401b08dba34aee20a3517eebae0d2a42e964cdc8d05",
      "0x0797acfdeba7a113cc9527552d96b34b8ac10d3c147091b897fbb7a8055e64bb",
      "0x16cc3eed811d10774f907a17d42dc6b207f2d17ca486c8d079efb9dace131dde",
      "0x050a28920598774615a611ab5c6f72c81f22d560238d25c2a56f46ba2321dfe8",
      "0x0abbae4e864a021284d4638e3e47d9cc4cf9c98f8bed53ac81c2a9b0fb0e8e88",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      "0x21e12b14cb9a0d9172c65c1bc4bc0ff05ee63c059275184704bf5ba891e94261",
      "0x21509f447c6a83d2cf18ee6dc957c14366e52cb4a5020c77f3aa1a4da485a4b4",
      "0x06a16a86984d8366c71e9c3590b52a03e79a67ce692771afe7402f632e885c2f",
      "0x23ff160f3ad666ebb042d0755022e6e3d7129c8e29ffcc0f2c1a4584eca73588",
      "0x2b6096e6e30e8cf37f1b866157010a41c7a2a6ebf25fd4c3b80c8b519df9b8d6",
      "0x129ee80b0dc60ed6662b3e954ac3dd828337fac1dd782e027e79bf2bfd2653f2",
      "0x2d553b5c9a9d0e7ece3e2434718e5fcda824c8eef9f5baede1dbee568875f9fa",
      "0x0cb73fb310e5c49c3b7801d2cb3884591a6e2f580e6870a59f302f69f8f5a513",
      "0x1738ffc8fc5b7fe03ac9be14267f02bc32df0c9150c4dcd5670f8d70f4dbae85",
      "0x2aa2ab53176480733c3a842e31d66e30ff4d4dd6aac905aee57846311fdb1622",
      "0x257b61afa0584f346bf9fe09e6a2723aa05d228e908ee622a81d5d9910eec2ca",
      "0x04eb34053ed41d8a2366c22a36bbef38e6af8344f13d822a1a320dddf664b092",
    ]
  );
}

async function setupSRSHash(dkimZK: Contract, srsHash: string) {
  const currentSRSHash = await dkimZK.srshash();
  if (currentSRSHash !== srsHash) {
    console.log("Set Up SRS Hash Start");
    const ret = await (await dkimZK.setupSRSHash(srsHash, txParams)).wait();
    expect(ret.status).to.equals(1);
    console.log("Set Up SRS Hash Success");
  } else {
    console.log("Not Need To Set Up SRS Hash");
  }
}

async function setupVKHash(dkimZK: Contract, len: 1024 | 2048, inputsLen: BigNumber, domainSize: BigNumber, vkData: string[]) {
  const vkHash = sha256(solidityPack(["uint64", "uint64", "uint128", "uint256[]"], [len, inputsLen, domainSize, vkData]));
  const currentVkHash = len === 1024 ? await dkimZK.vk1024hash : await dkimZK.vk2048hash;
  if (currentVkHash !== vkHash) {
    console.log("Set Up VK Hash Start");
    const ret = await (await dkimZK.setupVKHash(len, inputsLen, domainSize, vkData, txParams)).wait();
    expect(ret.status).to.equals(1);
    console.log("Set Up VK Hash Success");
  } else {
    console.log("Not Need To Set Up VK Hash");
  }
}

async function whiteListInit(signer: Signer) {
  const contractFactory = await ethers.getContractFactory("ModuleWhiteList");
  const whiteList = new Contract(WHITE_LIST_ADDRESS, contractFactory.interface, signer);
  await addImplementationWhiteList(whiteList, MODULE_MAIN_UPGRADABLE_ADDRESS);
}

async function addImplementationWhiteList(whiteList: Contract, addr: string) {
  if (!(await whiteList.isImplementationWhiteList(addr))) {
    console.log("Add Implementation Start");
    const ret = await (await whiteList.updateImplementationWhiteList(addr, true, txParams)).wait();
    expect(ret.status).to.equals(1);
    console.log("Add Implementation Success");
  } else {
    console.log("Not Need To Add Implementation");
  }
}

async function addHookWhiteList(whiteList: Contract, addr: string) {
  if (!(await whiteList.isHookWhiteList(addr))) {
    const ret = await (await whiteList.updateHookWhiteList(addr, true, txParams)).wait();
    expect(ret.status).to.equals(1);
  }
}

async function getAppEth() {
  const signer = new LedgerSigner(provider, "hid", adminPath);

  const address = await signer.getAddress();
  console.log("address", address);

  return signer;
}

main();
