import { expect } from "chai";
import { Contract, ContractFactory, Overrides, Wallet } from "ethers";
import { hexlify, randomBytes, solidityPack } from "ethers/lib/utils";
import { ethers } from "hardhat";
import NodeRSA from "node-rsa";
import {
  ASSETS_OP_THRESHOLD,
  getKeysetHash,
  GUARDIAN_THRESHOLD,
  GUARDIAN_TIMELOCK_THRESHOLD,
  OWNER_THRESHOLD,
  transferEth,
} from "./utils/common";
import { Deployer } from "./utils/deployer";
import { randomKeys, selectKeys } from "./utils/key";
import { executeCall, generateTransferTx, generateUpdateKeysetHashTx, Role } from "./utils/sigPart";

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

    const ModuleMainUpgradable = await ethers.getContractFactory("ModuleMainUpgradable");
    const moduleMainUpgradable = await deployer.deployContract(ModuleMainUpgradable, instance, txParams, dkimKeys.address);

    ModuleMain = await ethers.getContractFactory("ModuleMain");
    moduleMain = await deployer.deployContract(
      ModuleMain,
      instance,
      txParams,
      deployer.singleFactoryContract.address,
      moduleMainUpgradable.address,
      dkimKeys.address
    );

    chainId = await (await moduleMain.provider.getNetwork()).chainId;
    const privateKey = new NodeRSA({ b: 2048 });
    unipassPrivateKey = privateKey.exportKey("pkcs1");
    const ret = await (
      await dkimKeys
        .connect(dkimKeysAdmin)
        .updateDKIMKey(
          solidityPack(["bytes", "bytes"], [Buffer.from("s2055"), Buffer.from("unipass.com")]),
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

      it("Relay 1/1 Update KeysetHash transaction", async () => {
        const newKeysetHash = hexlify(randomBytes(32));

        for (const [role, threshold, withTimeOut] of [
          [Role.Owner, OWNER_THRESHOLD, false],
          [Role.Guardian, GUARDIAN_THRESHOLD, false],
          [Role.Guardian, GUARDIAN_TIMELOCK_THRESHOLD, true],
        ]) {
          const results: number[] = [];
          for (let i = 0; i < runs; i++) {
            const keys = await randomKeys(10, unipassPrivateKey, testERC1271Wallet);
            const keysetHash = getKeysetHash(keys);
            const wallet = await deployer.deployProxyContract(moduleMain.interface, moduleMain.address, keysetHash, txParams);

            const transaction = await generateUpdateKeysetHashTx(
              wallet,
              1,
              newKeysetHash,
              withTimeOut as boolean,
              selectKeys(keys, role as Role, threshold as number)
            );

            const tx = await executeCall([transaction], chainId, 1, [], wallet, undefined, txParams);
            results.push(tx.gasUsed);
          }

          report(`relay 1/1 Update Keyset By ${role} transaction`, results);
        }
      });

      it("Relay 1/1 Transfer Eth transaction", async () => {
        const results: number[] = [];
        for (let i = 0; i < runs; i++) {
          const keys = await randomKeys(10, unipassPrivateKey, testERC1271Wallet);
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
            selectKeys(keys, Role.AssetsOp, ASSETS_OP_THRESHOLD),
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
