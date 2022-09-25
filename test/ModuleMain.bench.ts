import { expect } from "chai";
import { Contract, ContractFactory, Overrides, Wallet } from "ethers";
import { formatBytes32String, hexlify, hexZeroPad, randomBytes, solidityPack } from "ethers/lib/utils";
import { ethers } from "hardhat";
import NodeRSA from "node-rsa";
import { getKeysetHash, transferEth } from "./utils/common";
import { Deployer } from "./utils/deployer";
import { randomNewWallet } from "./utils/key";
import {
  executeCall,
  generateTransferTx,
  generateUnlockKeysetHashTx,
  generateUpdateKeysetHashTx,
  generateUpdateTimeLockDuringTx,
  Role,
} from "./utils/sigPart";

const runs = 256;

function report(test: string, values: number[]) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values
    .map((n) => ethers.BigNumber.from(n))
    .reduce((p, n) => p.add(n))
    .div(values.length)
    .toNumber();

  console.info(` -> ${test} runs: ${values.length} cost min: ${min} max: ${max} avg: ${avg}`);
}

describe("ModuleMain Benchmark", function () {
  let deployer: Deployer;
  let dkimKeys: Contract;
  let moduleMain: Contract;
  let ModuleMain: ContractFactory;
  let chainId: number;
  let txParams: Overrides;
  let unipassPrivateKey: string;
  let testERC1271Wallet: [Contract, Wallet][] = [];
  let Greeter: ContractFactory;
  let greeter1: Contract;
  let greeter2: Contract;
  this.beforeAll(async () => {
    const TestERC1271Wallet = await ethers.getContractFactory("TestERC1271Wallet");
    const [signer] = await ethers.getSigners();
    deployer = await new Deployer(signer).init();
    txParams = {
      gasLimit: 10000000,
      gasPrice: (await signer.getGasPrice()).mul(12).div(10),
    };

    const instance = 0;

    for (let i = 0; i < 10; i++) {
      const wallet = Wallet.createRandom();
      testERC1271Wallet.push([await deployer.deployContract(TestERC1271Wallet, i, txParams, wallet.address), wallet]);
    }

    const DkimKeys = await ethers.getContractFactory("DkimKeys");
    const dkimKeysAdmin = Wallet.createRandom().connect(signer.provider!);
    await transferEth(dkimKeysAdmin.address, 10);
    dkimKeys = await deployer.deployContract(DkimKeys, instance, txParams, dkimKeysAdmin.address);

    Greeter = await ethers.getContractFactory("Greeter");
    greeter1 = await Greeter.deploy();
    greeter2 = await Greeter.deploy();

    const moduleWhiteListAdmin: Wallet = Wallet.createRandom().connect(signer.provider!);
    await transferEth(moduleWhiteListAdmin.address, 1);
    const ModuleWhiteList = await ethers.getContractFactory("ModuleWhiteList");
    const moduleWhiteList = await (await ModuleWhiteList.deploy(moduleWhiteListAdmin.address)).connect(moduleWhiteListAdmin);
    let ret = await (await moduleWhiteList.updateImplementationWhiteList(greeter1.address, true)).wait();
    expect(ret.status).to.equals(1);
    ret = await (await moduleWhiteList.updateHookWhiteList(greeter2.address, true)).wait();
    expect(ret.status).to.equals(1);

    const ModuleMainUpgradable = await ethers.getContractFactory("ModuleMainUpgradable");
    const moduleMainUpgradable = await deployer.deployContract(
      ModuleMainUpgradable,
      instance,
      txParams,
      dkimKeys.address,
      moduleWhiteList.address
    );
    ret = await (await moduleWhiteList.updateImplementationWhiteList(moduleMainUpgradable.address, true)).wait();
    expect(ret.status).to.equals(1);

    ModuleMain = await ethers.getContractFactory("ModuleMain");
    moduleMain = await deployer.deployContract(
      ModuleMain,
      instance,
      txParams,
      deployer.singleFactoryContract.address,
      moduleMainUpgradable.address,
      dkimKeys.address,
      moduleWhiteList.address
    );

    chainId = await (await moduleMain.provider.getNetwork()).chainId;
    const privateKey = new NodeRSA({ b: 2048 });
    unipassPrivateKey = privateKey.exportKey("pkcs1");
    ret = await (
      await dkimKeys
        .connect(dkimKeysAdmin)
        .updateDKIMKey(
          solidityPack(["bytes32", "bytes32"], [formatBytes32String("s2055"), formatBytes32String("unipass.com")]),
          privateKey.exportKey("components-public").n.subarray(1)
        )
    ).wait();
    expect(ret.status).to.equals(1);
  });

  if (process.env.BENCHMARK) {
    describe.only("BenchMark", function () {
      this.timeout(0);

      it("Deploy A Wallet", async () => {
        let results: number[] = [];
        for (let i = 0; i < runs; i++) {
          const salt = ethers.utils.hexlify(randomBytes(32));
          const ret = await (
            await deployer.singleFactoryContract.deploy(Deployer.getInitCode(moduleMain.address), salt, txParams)
          ).wait();
          results.push(ret.gasUsed);
        }
        report("deploy wallets", results);
      });

      it("Relay 1/1 Update KeysetHash By 2 Emails transaction", async () => {
        const newKeysetHash = hexlify(randomBytes(32));

        const results: number[] = [];
        for (let i = 0; i < runs; i++) {
          const keys = await randomNewWallet(unipassPrivateKey);
          const keysetHash = getKeysetHash(keys);
          const wallet = await deployer.deployProxyContract(moduleMain.interface, moduleMain.address, keysetHash, txParams);

          const transaction = await generateUpdateKeysetHashTx(chainId, wallet, 1, newKeysetHash, false, Role.Owner, [
            [keys[0], false],
            [keys[1], true],
            [keys[2], true],
          ]);

          const tx = await executeCall([transaction], chainId, 1, [], wallet, undefined, txParams);
          results.push(tx.gasUsed);
        }

        report(`relay 1/1 Update Keyset By 2 Emails transaction`, results);
      });

      it("Relay 1/1 Update KeysetHash By 1 Email And 1 Secp256k1 transaction", async () => {
        const newKeysetHash = hexlify(randomBytes(32));

        const results: number[] = [];
        for (let i = 0; i < runs; i++) {
          const keys = await randomNewWallet(unipassPrivateKey);
          const keysetHash = getKeysetHash(keys);
          const wallet = await deployer.deployProxyContract(moduleMain.interface, moduleMain.address, keysetHash, txParams);

          const transaction = await generateUpdateKeysetHashTx(chainId, wallet, 1, newKeysetHash, false, Role.Owner, [
            [keys[0], true],
            [keys[1], true],
            [keys[2], false],
          ]);

          const tx = await executeCall([transaction], chainId, 1, [], wallet, undefined, txParams);
          results.push(tx.gasUsed);
        }

        report(`relay 1/1 Update Keyset By 1 Email And 1 Secp256k1 transaction`, results);
      });

      it("Relay 1/1 Update KeysetHash With TimeLock By 2 Emails transaction", async () => {
        const newKeysetHash = hexlify(randomBytes(32));

        const results: number[] = [];
        for (let i = 0; i < runs; i++) {
          const keys = await randomNewWallet(unipassPrivateKey);
          const keysetHash = getKeysetHash(keys);
          const wallet = await deployer.deployProxyContract(moduleMain.interface, moduleMain.address, keysetHash, txParams);

          const transaction = await generateUpdateKeysetHashTx(chainId, wallet, 1, newKeysetHash, true, Role.Guardian, [
            [keys[0], false],
            [keys[1], true],
            [keys[2], true],
          ]);

          const tx = await executeCall([transaction], chainId, 1, [], wallet, undefined, txParams);
          results.push(tx.gasUsed);
        }

        report(`relay 1/1 Update Keyset With TimeLock By 2 Emails transaction`, results);
      });

      it("Relay 1/1 Unlock KeysetHash transaction", async () => {
        const newKeysetHash = hexlify(randomBytes(32));

        const results: number[] = [];
        for (let i = 0; i < runs; i++) {
          const keys = await randomNewWallet(unipassPrivateKey);
          const keysetHash = getKeysetHash(keys);
          const wallet = await deployer.deployProxyContract(moduleMain.interface, moduleMain.address, keysetHash, txParams);

          let transaction = await generateUpdateTimeLockDuringTx(chainId, wallet, 1, 1, [
            [keys[0], false],
            [keys[1], true],
            [keys[2], true],
          ]);

          let tx = await executeCall([transaction], chainId, 1, [], wallet, undefined, txParams);

          transaction = await generateUpdateKeysetHashTx(chainId, wallet, 2, newKeysetHash, true, Role.Guardian, [
            [keys[0], false],
            [keys[1], true],
            [keys[2], true],
          ]);

          tx = await executeCall([transaction], chainId, 2, [], wallet, undefined, txParams);

          await new Promise((resolve) => setTimeout(resolve, 2000));

          transaction = await generateUnlockKeysetHashTx(wallet, 3);

          tx = await executeCall([transaction], chainId, 3, [], wallet, undefined, txParams);
          results.push(tx.gasUsed);
        }

        report(`relay 1/1 Unlock KeysetHash transaction transaction`, results);
      });

      it("Relay 1/1 Transfer Eth transaction", async () => {
        const results: number[] = [];
        for (let i = 0; i < runs; i++) {
          const keys = await randomNewWallet(unipassPrivateKey);
          const keysetHash = getKeysetHash(keys);
          const wallet = await deployer.deployProxyContract(moduleMain.interface, moduleMain.address, keysetHash, txParams);
          await transferEth(wallet.address, 1);

          const transaction = await generateTransferTx(
            ethers.constants.AddressZero,
            ethers.constants.Zero,
            ethers.utils.parseEther("0.001")
          );

          const tx = await executeCall(
            [transaction],
            chainId,
            1,
            [
              [keys[0], true],
              [keys[1], false],
              [keys[2], false],
            ],
            wallet,
            {
              key: Wallet.createRandom(),
              timestamp: Math.ceil(Date.now() / 1000) + 10000,
              weight: 100,
            },
            txParams
          );
          results.push(tx.gasUsed);
        }
        report(`relay 1/1 Transfer transaction`, results);
      });
    });
  }
});
