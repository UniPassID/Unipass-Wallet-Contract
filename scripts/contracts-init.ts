import { formatBytes32String, hexlify, keccak256, sha256, solidityPack, toUtf8Bytes } from "ethers/lib/utils";
import { BigNumber, constants, Contract, providers, Signer, Wallet } from "ethers";
import { ethers, network } from "hardhat";
import { expect } from "chai";
import base64url from "base64url";
import { LedgerSigner } from "@ethersproject/hardware-wallets";
import * as fs from "fs";

const provider = new providers.Web3Provider(network.provider.send);

const networkName = network.name;

const networks = fs.readFileSync(`${__dirname}/../networks/${networkName}.json`);
let OPENID_ADDRESS = "";
let DKIMZK_ADDRESS = "";
let DKIM_KEYS_ADDRESS = "";
let WHITE_LIST_ADDRESS = "";
let MODULE_MAIN_UPGRADABLE_ADDRESS = "";

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
    default:
      break;
  }
}

expect(OPENID_ADDRESS).not.equals("");
expect(DKIMZK_ADDRESS).not.equals("");
expect(DKIM_KEYS_ADDRESS).not.equals("");
expect(WHITE_LIST_ADDRESS).not.equals("");
expect(MODULE_MAIN_UPGRADABLE_ADDRESS).not.equals("");

const adminPath = "44'/60'/5'/0/0";

const txParams = networkName.includes("testnet")
  ? {
      gasLimit: 10000000,
      gasPrice: constants.Zero,
    }
  : {
      gasLimit: 10000000,
      gasPrice: constants.Zero,
      type: 1,
    };

async function main() {
  const gasPrice = (await provider.getFeeData()).gasPrice?.mul(12).div(10);
  console.log("Gas Price", gasPrice?.toNumber());
  if (gasPrice === undefined) {
    throw new Error("Cannot Get Gas Price");
  }
  txParams.gasPrice = gasPrice;
  const signer = await getAppEth();
  await openIDInit(signer);
  await dkimZKInit(signer);
  await dkimKeysInit(signer);
  await whiteListInit(signer);
}

async function dkimKeysInit(signer: Signer) {
  const contractFactory = await ethers.getContractFactory("DkimKeys");
  const dkimKeys = new Contract(DKIM_KEYS_ADDRESS, contractFactory.interface, signer);

  let emailServers: string[] = [];
  let keys: string[] = [];
  for (const { selector, domain, n } of [
    {
      selector: formatBytes32String("20161025"),
      domain: formatBytes32String("gmail.com"),
      n: hexlify(
        "0xbe23c6064e1907ae147d2a96c8089c751ee5a1d872b5a7be11845056d28384cfb59978c4a91b4ffe90d3dec0616b3926038f27da4e4d254c8c1283bc9dcdabeac500fbf0e89b98d1059a7aa832893b08c9e51fcea476a69511be611250a91b6a1204a22561bb87b79f1985a687851184533d93dfab986fc2c02830c7b12df9cf0e3259e068b974e3f6cf99fa63744c8b5b23629a4efad425fa2b29b3622443373d4c389389ececc5692e0f15b54b9f49b999fd0754db41a4fc16b8236f68555f9546311326e56c1ea1fe858e3c66f3a1282d440e3b487579dd2c198c8b15a5bab82f1516f48c4013063319c4a06789f943c5fc4e7768c2c0d4ce871c3c51a177"
      ),
    },
    {
      selector: formatBytes32String("20161025"),
      domain: formatBytes32String("googlemail.com"),
      n: hexlify(
        "0xbe23c6064e1907ae147d2a96c8089c751ee5a1d872b5a7be11845056d28384cfb59978c4a91b4ffe90d3dec0616b3926038f27da4e4d254c8c1283bc9dcdabeac500fbf0e89b98d1059a7aa832893b08c9e51fcea476a69511be611250a91b6a1204a22561bb87b79f1985a687851184533d93dfab986fc2c02830c7b12df9cf0e3259e068b974e3f6cf99fa63744c8b5b23629a4efad425fa2b29b3622443373d4c389389ececc5692e0f15b54b9f49b999fd0754db41a4fc16b8236f68555f9546311326e56c1ea1fe858e3c66f3a1282d440e3b487579dd2c198c8b15a5bab82f1516f48c4013063319c4a06789f943c5fc4e7768c2c0d4ce871c3c51a177"
      ),
    },
    {
      selector: formatBytes32String("s201512"),
      domain: formatBytes32String("qq.com"),
      n: hexlify(
        "0xcfb0520e4ad78c4adb0deb5e605162b6469349fc1fde9269b88d596ed9f3735c00c592317c982320874b987bcc38e8556ac544bdee169b66ae8fe639828ff5afb4f199017e3d8e675a077f21cd9e5c526c1866476e7ba74cd7bb16a1c3d93bc7bb1d576aedb4307c6b948d5b8c29f79307788d7a8ebf84585bf53994827c23a5"
      ),
    },
    {
      selector: formatBytes32String("s201512"),
      domain: formatBytes32String("foxmail.com"),
      n: hexlify(
        "0xcfb0520e4ad78c4adb0deb5e605162b6469349fc1fde9269b88d596ed9f3735c00c592317c982320874b987bcc38e8556ac544bdee169b66ae8fe639828ff5afb4f199017e3d8e675a077f21cd9e5c526c1866476e7ba74cd7bb16a1c3d93bc7bb1d576aedb4307c6b948d5b8c29f79307788d7a8ebf84585bf53994827c23a5"
      ),
    },
    {
      selector: formatBytes32String("s110527"),
      domain: formatBytes32String("163.com"),
      n: hexlify(
        "0xa9f49a52ec4391363c089ed5c8235ee626ec286fe849a15987af68761cfa5213b418821f35e641dd602e096f15e070fd26359398dd1d5593a7540d1f0d4222fec41f5f44d5854b7e93abb0b33c4fd423ff8fc5684fccf9ef001af881b41cadeb3c79ef5c80430f143a5c9383bb50b3493711f4d3739f7268752bec431b2a8f59"
      ),
    },
    {
      selector: formatBytes32String("s110527"),
      domain: formatBytes32String("126.com"),
      n: hexlify(
        "0xa9f49a52ec4391363c089ed5c8235ee626ec286fe849a15987af68761cfa5213b418821f35e641dd602e096f15e070fd26359398dd1d5593a7540d1f0d4222fec41f5f44d5854b7e93abb0b33c4fd423ff8fc5684fccf9ef001af881b41cadeb3c79ef5c80430f143a5c9383bb50b3493711f4d3739f7268752bec431b2a8f59"
      ),
    },
    {
      selector: formatBytes32String("s110527"),
      domain: formatBytes32String("yeah.net"),
      n: hexlify(
        "0xa9f49a52ec4391363c089ed5c8235ee626ec286fe849a15987af68761cfa5213b418821f35e641dd602e096f15e070fd26359398dd1d5593a7540d1f0d4222fec41f5f44d5854b7e93abb0b33c4fd423ff8fc5684fccf9ef001af881b41cadeb3c79ef5c80430f143a5c9383bb50b3493711f4d3739f7268752bec431b2a8f59"
      ),
    },
    {
      selector: formatBytes32String("s110527"),
      domain: formatBytes32String("188.com"),
      n: hexlify(
        "0xa9f49a52ec4391363c089ed5c8235ee626ec286fe849a15987af68761cfa5213b418821f35e641dd602e096f15e070fd26359398dd1d5593a7540d1f0d4222fec41f5f44d5854b7e93abb0b33c4fd423ff8fc5684fccf9ef001af881b41cadeb3c79ef5c80430f143a5c9383bb50b3493711f4d3739f7268752bec431b2a8f59"
      ),
    },
    {
      selector: formatBytes32String("s110527"),
      domain: formatBytes32String("vip.163.com"),
      n: hexlify(
        "0xa9f49a52ec4391363c089ed5c8235ee626ec286fe849a15987af68761cfa5213b418821f35e641dd602e096f15e070fd26359398dd1d5593a7540d1f0d4222fec41f5f44d5854b7e93abb0b33c4fd423ff8fc5684fccf9ef001af881b41cadeb3c79ef5c80430f143a5c9383bb50b3493711f4d3739f7268752bec431b2a8f59"
      ),
    },
    {
      selector: formatBytes32String("s110527"),
      domain: formatBytes32String("vip.126.com"),
      n: hexlify(
        "0xa9f49a52ec4391363c089ed5c8235ee626ec286fe849a15987af68761cfa5213b418821f35e641dd602e096f15e070fd26359398dd1d5593a7540d1f0d4222fec41f5f44d5854b7e93abb0b33c4fd423ff8fc5684fccf9ef001af881b41cadeb3c79ef5c80430f143a5c9383bb50b3493711f4d3739f7268752bec431b2a8f59"
      ),
    },
    {
      selector: formatBytes32String("s110527"),
      domain: formatBytes32String("vip.188.com"),
      n: hexlify(
        "0xa9f49a52ec4391363c089ed5c8235ee626ec286fe849a15987af68761cfa5213b418821f35e641dd602e096f15e070fd26359398dd1d5593a7540d1f0d4222fec41f5f44d5854b7e93abb0b33c4fd423ff8fc5684fccf9ef001af881b41cadeb3c79ef5c80430f143a5c9383bb50b3493711f4d3739f7268752bec431b2a8f59"
      ),
    },
    {
      selector: formatBytes32String("s2048"),
      domain: formatBytes32String("yahoo.com"),
      n: hexlify(
        "0xba85ae7e06d6c39f0c7335066ccbf5efa45ac5d64638c9109a7f0e389fc71a843a75a95231688b6a3f0831c1c2d5cb9b271da0ce200f40754fb4561acb22c0e1ac89512364d74feea9f072894f2a88f084e09485ae9c5f961308295e1bb7e835b87c3bc0bce0b827f8600a11e97c54291b00a07ba817b33ebfa6cc67f5f51bebe258790197851f80943a3bc17572428aa19e4aa949091f9a436aa6e0b3e1773e9ca201441f07a104cce03528c3d15891a9ce03ed2a8ba40dc42e294c3d180ba5ee4488c84722ceaadb69428d2c6026cf47a592a467cc8b15a73ea3753d7f615e518ba614390e6c3796ea37367c4f1a109646d5472e9e28e8d49e84924e648087"
      ),
    },
    {
      selector: formatBytes32String("dbd5af2cbaf7"),
      domain: formatBytes32String("mail.com"),
      n: hexlify(
        "0xede596d226cb20962f0813f0f77192bffa52b5ef8668a4eee295ce446ec8f683edbb7ad2373023ff3267d44c1ba792381f68dbee3d17431db3e11f521513f126444a0cc134cb702bd693f7a000be9f0c6b57f2b67ea2462de0ef85c9929b937bd5f58e66882b82b9d23e08648318602c8de499e9b1287b6682a3f2dd3e22e2f5"
      ),
    },
    {
      selector: formatBytes32String("selector1"),
      domain: formatBytes32String("outlook.com"),
      n: hexlify(
        "0xbd6ca4b6b20bf033bff941af31bbfb70f77f5e88296ecee9815c3ccbd95d3ba00032683cfa28c4365fdcec56f531f28ceee1b72ccc00af475554ac8cfa66e4a17da4e4bee5b11390af467d8064a9bbbc6b9d939ae7cfbfa4885dd9793f0c53e96b9f9329b5a875bb1264f44df33d11639c79f6377349c957944c8df661197663a2293b0e3fa03bbd0c5f4b26bd8e0e4df3575f34dbcfec79d67a330cb0ac8832b5e9b713a1201b84607ebb2437bdf10817d78a07bc6336533e7789ffd25bc305d3dad887db29e19b1a58b220e93df8dc9ce56edaec1911820c9f493e9c515998a6b73f94a7f0652b34fab020ab06285bfc18b7a59884041e148bfbebb8be5109"
      ),
    },
    {
      selector: formatBytes32String("selector1"),
      domain: formatBytes32String("hotmail.com"),
      n: hexlify(
        "0xbd6ca4b6b20bf033bff941af31bbfb70f77f5e88296ecee9815c3ccbd95d3ba00032683cfa28c4365fdcec56f531f28ceee1b72ccc00af475554ac8cfa66e4a17da4e4bee5b11390af467d8064a9bbbc6b9d939ae7cfbfa4885dd9793f0c53e96b9f9329b5a875bb1264f44df33d11639c79f6377349c957944c8df661197663a2293b0e3fa03bbd0c5f4b26bd8e0e4df3575f34dbcfec79d67a330cb0ac8832b5e9b713a1201b84607ebb2437bdf10817d78a07bc6336533e7789ffd25bc305d3dad887db29e19b1a58b220e93df8dc9ce56edaec1911820c9f493e9c515998a6b73f94a7f0652b34fab020ab06285bfc18b7a59884041e148bfbebb8be5109"
      ),
    },
    {
      selector: formatBytes32String("20210112"),
      domain: formatBytes32String("gmail.com"),
      n: hexlify(
        "0xabc27154130b1d9463d56bc83121c0a516370eb684fc4885891e88300943abd1809eb572d2d0d0c81343d46f3ed5fcb9470b2c43d0e07cd7bbac89b0c5a6d67d6c49d4b4a6a3f0f311d38738935088ffe7c3b31d986bbe47d844bc17864500269f58e43b8e8a230fe9da51af98f49edfe0150fe5f2697678bc919364a1540a7a1cb40554c878d20d3eca9c4b1a88d0f6ad5b03bf28ac254007f84c917e61d20707c954701d27da03f1c9fd36322e9ff1072d2230842c5798b26568978d005b5c19e0f669119b1da4bb33a69314ffaa9387f6b9c471df57320b16eee7408355f53e778264203341143895f8c22968315721fd756c6a12d3ca010508b23d7817d3"
      ),
    },
    {
      selector: formatBytes32String("20210112"),
      domain: formatBytes32String("googlemail.com"),
      n: hexlify(
        "0xabc27154130b1d9463d56bc83121c0a516370eb684fc4885891e88300943abd1809eb572d2d0d0c81343d46f3ed5fcb9470b2c43d0e07cd7bbac89b0c5a6d67d6c49d4b4a6a3f0f311d38738935088ffe7c3b31d986bbe47d844bc17864500269f58e43b8e8a230fe9da51af98f49edfe0150fe5f2697678bc919364a1540a7a1cb40554c878d20d3eca9c4b1a88d0f6ad5b03bf28ac254007f84c917e61d20707c954701d27da03f1c9fd36322e9ff1072d2230842c5798b26568978d005b5c19e0f669119b1da4bb33a69314ffaa9387f6b9c471df57320b16eee7408355f53e778264203341143895f8c22968315721fd756c6a12d3ca010508b23d7817d3"
      ),
    },
    {
      selector: formatBytes32String("protonmail"),
      domain: formatBytes32String("protonmail.com"),
      n: hexlify(
        "0xca678aeacca0caadf24728d7d3821d41ff736da07ad1f13e185d3b8796da4526585cf867230c4a5fdadbf31e747b47b11b84e762c32e122e0097a8421141eeecc0e4fcbeae733d9ebf239d28f22b31cf9d10964bcda085b27a2350aa50cf40b41ecb441749f2f39d063f6c7c6f280a808b7dc2087c12fce3eeb96707abc0c2a9"
      ),
    },
    {
      selector: formatBytes32String("protonmail"),
      domain: formatBytes32String("pm.me"),
      n: hexlify(
        "0xa66408196cdf68bf5c7be5611dcad34f32bdaf19fc1f7f4f3eeff3b833b98af8baf1accc646cfc6aa3d3bcc017471d96b58bddf5b3e3897d9fb6172050fc86da55246122c4cb973ea027d69faf8e0e656cff6d1f2bad70d42d2eedf38ccd8b203a39a9d8aa133dc401a721df31b566cc219eb9ee55256be36a8d0a5f51849c39999d9d0cad3705e5b4a243ab40b9457818d1f27f2b2101e03021201bf94b4093d83e2e9e218c3bb12ee1cad100ef04d2b54ddbb42c6e1b138da18f780dea12cf7cda903556ebc1969b49c5ae0262e84add20afbe5cd11f9087d8fd181081f2169d7501b27019b2684092eef62b0c8c7c8093e3995f919516fe55e7fa01dbbda5"
      ),
    },
    {
      selector: formatBytes32String("1a1hai"),
      domain: formatBytes32String("icloud.com"),
      n: hexlify(
        "0xd5911f6e47f84db3b64c3648ebb5a127a1bc0f0937489c806c1944fd029dc971590781df114ec072e641cdc5d2245134dc3966c8e91402669a47cc85970a281f268a44b21a4f77a91a52f9606a30c9f22d2e5cb6934263d08388091c56ac1dfbf1beea31e8a613c2a51f550d695a514d38b45c862320a00ea539419a433d6bfdd1978356cbca4b600a570fe582918c4f731a0002068df28b2a193089e6bf951c553b5a6f71aaadcc6669dfa346f322717851a8c22a324041af8736e87de4358860fff057beff3f19046a43adce46c932514988afe1309f87414bd36ed296dacfade2e0caf03235e91a2db27e9ed214bcc6e5cf995b5ef59ce9943d1f4209b6ab"
      ),
    },
    {
      selector: formatBytes32String("1ca1ba"),
      domain: formatBytes32String("icloud.com"),
      n: hexlify(
        "0xc98924fd152c4166028dd31acba0ece995af40b179fed81f25362aa274ea4cb12e60fe650336631867149036380b5e52069d8500e582906ad3c2ae7a87ee9ef7c1e3a06370af40451bd6fb157b621654e0bbebb3fa9de6d862ab783972de5610ef9da04c14e863d604f9d9166c1a027a1c67e580bd7b988dc8915245af8031a1a513cb4c10e36930105a74a2af50b8f852ea260f6f86bfc195d73c3292d886c8a2dd259013124b637037b25464850d80f52aa73f7823288514fe11ea7910a0e2d41e46667180554389b8eddf588549f533606ba1dcbc943c9fca4db43c3d93009e8d2d89283d1847d6245261b1300f255743d8e06d2e6ba167c5f05f35c83125"
      ),
    },
    {
      selector: formatBytes32String("protonmail2"),
      domain: formatBytes32String("protonmail.com"),
      n: hexlify(
        "0xa9c499799ec7a22011a1a1821a5c86fd0e770169c5e4f7958e4b604663167853af23322b36a6d869ae618e5eee751a53b506db5a4c93517a2d50bf937225d4ee6a03793dc969db81345214eec777e5df808c9f16406b8f72e787d705590f9c6cb682ebaba72ac9fb56b2f23f05c8af7c197f364445070865e05452baa5cf444571d6dd2c0f5b8aa3e97be1b84ec1fd4d021fdde175258b8c17e52f7ba32a4210bccdae5947f417f563cf44f9b06c80eede484228970324b565a63741f816a3b2bd3a14b86d30e65299f0a5e7896339931683292e2d0d2280c6f2a704989f8709e323380fe40085a05970c8c5ad4006d150dff204a9953bd6cdcb2e0ebc7f54b1"
      ),
    },
    {
      selector: formatBytes32String("protonmail2"),
      domain: formatBytes32String("pm.me"),
      n: hexlify(
        "0xb1dfac7052467ccf79f7870f2aa3a514effcbb0da7e5981945b386512de1fd9dd70bae840b13aac4a6083b585228825e7be1e0ea144746598e42ca340279c8039e2d13c066f33ff30bb97c231350c2c3d4169fd9d73d1fd1acf2d650ddeba77852ed8fbb8f1177ac717d4cb3eecfd38317b939ce98a858f1dc0e5dabcaf9be9636b6a24ec74d6dc532496aaa83b2d9f7191aedb595073a99baa5524093c7629f4b39ca20e6c1a17f894e18e5e44fa7ea4a7177bb4038c2bcbbab413e733494bbae41ae70ec059791b2e508f396058b9e6a2c581417f7a4f59332460f08a2565ed057182a1e34a3ece7ab9622b131472104c4fbed30c672012571847bba281b25"
      ),
    },
    {
      selector: formatBytes32String("protonmail3"),
      domain: formatBytes32String("protonmail.com"),
      n: hexlify(
        "0xce616b9af91a54e135d2e79ea0438c8e8b698faeed33e6cd0006ff5c40db87f7cfa168db932cecc51fc76dc121ee57c9cab4e5e19fb8cec269b527fb3f9f9dd69b8588bb023fc5be2e7e5fe2524d769edc104b2ce2fd2e33c87671ecfcf4f652ba80f6ea1e5c7c59e745dcbb774e408345db13fbd82efd647561c7c0afd4c4bdba1abb0a25c4ca70da3e524c771a75ea86c24934bcbf514600232e30de64509f18dd134282ef87d0051ffb5b08906f8ec96d04c3889685b6286207708d77afe165f8b97ec1aca32a565d1fee2ff2e241c4c6802f2048ce18b92033c08b941383feff6ddd380f25f355a62d38ca45d8783565f574638f43a6bdde72275247d39b"
      ),
    },
    {
      selector: formatBytes32String("protonmail3"),
      domain: formatBytes32String("pm.me"),
      n: hexlify(
        "0xb1929caebbdbfc48b036f6b8b0d3ec94c4c4599d64534d8ff77d8713f52e40ba71068d783e7ee1f454ce009504b5c0739ab256cb2131d03884ad002d1e2abbf921f3d0614df8eb80e423e1cb3a8df3a383a46078c82e4d8085ead422e86afe9f4d7e722548c561c92c39cb2ad36cd6ea6c29ea40827ce0d4e2de9863199670e5c604af6238e56f5d018adaeba59df46807996ed726e39d28d38274b0b3583e482addce9249d9168f85f118222c039abf85e5a9b7209651d6a77c064285ff1f0c1bc45f47d0c764c4d69e0552dc295a17d1ca588d63cdd10a31e1e30eeace43d110d943fce788572d2a096e05cff6e8ec72dc869473c415ec080508478194d661"
      ),
    },
  ]) {
    const emailServer = solidityPack(["bytes32", "bytes32"], [selector, domain]);
    if ((await dkimKeys.callStatic.getDKIMKey(emailServer)) !== n && !emailServers.includes(emailServer) && !keys.includes(n)) {
      emailServers.push(emailServer);
      keys.push(n);
    }
  }

  if (emailServers.length !== 0) {
    console.log("Updating Dkim Keys Public Keys");
    const ret = await (await dkimKeys.batchUpdateDKIMKeys(emailServers, keys, txParams)).wait();
    expect(ret.status).to.equals(1);
    console.log("Updating Dkim Keys Success");
  } else {
    console.log("DkimKeys Pbulic Keys Have Been Updated");
  }
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
  let keys: string | string[] = [];
  let pubKeys = [];
  for (const { iss, kid, pubKey } of [
    {
      iss: "https://accounts.google.com",
      kid: "27b86dc6938dc327b204333a250ebb43b32e4b3c",
      pubKey:
        "1X7rNtYVglDjBJgsBOSv7C6MYU6Mv-yraGOp_AGs777c2UcVGj88dBe9KihGicQ3LqU8Vf5fVhPixVy0GFBS7mJt3qJryyBpmG7sChnJQBwJmZEffZUl_rLtwGli8chbZj_Fpgjd-7t74VQJmn2SYkFqHNB3vrW_I8zmwn7_Enn4N84d4dP5R9UChUSLhuPNKaKA-a4vtTKy1LNoZpbr6LG1_QaWGDKNhgPWR-6l5fmBdaXtUgDmPFwdQZuiBUDfnPQ7t1lSUD2PJMnG3M9DKG5gqpSk1L1AlWsxntideNsKWIviZ5PhCpmzEComWNtFtFrzfAWQvLkBbgb0pwWp5w",
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
    if ((await openID.callStatic.getOpenIDPublicKey(key)) !== hexlify(n) && !keys.includes(key)) {
      keys.push(key);
      pubKeys.push(n);
    }
  }

  if (keys.length !== 0) {
    console.log("Updating OpenID Public Key");
    const ret = await (await openID.batchUpdateOpenIDPublicKey(keys, pubKeys, txParams)).wait();
    expect(ret.status).to.equals(1);
    console.log("Updating OpenID Public Key Success");
  } else {
    console.log("OpenID Public Keys Have Been Updated");
  }

  for (const { iss, kid } of [
    {
      iss: "https://accounts.google.com",
      kid: "f451345fad08101bfb345cf642a2da9267b9ebeb",
    },
  ]) {
    const key = keccak256(solidityPack(["bytes", "bytes"], [toUtf8Bytes(iss), toUtf8Bytes(kid)]));
    if ((await openID.callStatic.getOpenIDPublicKey(key)) !== "0x") {
      console.log("Deleting OpenID Public Key");
      const ret = await (await openID.deleteOpenIDPublicKey(key, txParams)).wait();
      expect(ret.status).to.equals(1);
    } else {
      console.log("OpenID Public Key Has Been Deleted");
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
  const vkHash = sha256(solidityPack(["uint64", "uint128", "uint256[]"], [inputsLen, domainSize, vkData]));
  const currentVkHash = len === 1024 ? await dkimZK.vk1024hash() : await dkimZK.vk2048hash();
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
  let signer: Signer;
  if (networkName.includes("testnet")) {
    signer = new Wallet(process.env.DKIM_KEYS_ADMIN!, provider);
  } else {
    signer = new LedgerSigner(provider, "hid", adminPath);
  }

  const address = await signer.getAddress();
  console.log("network", networkName);
  console.log("address", address);

  return signer;
}

main();
