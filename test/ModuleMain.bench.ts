import { Contract, ContractFactory, Wallet } from "ethers";
import { hexlify, id, randomBytes } from "ethers/lib/utils";
import { ethers } from "hardhat";
import {
  generateRecoveryEmails,
  getKeysetHash,
  getProxyAddress,
  transferEth,
} from "./utils/common";
import {
  executeCall,
  executeUpdateKeysetHash,
  generateTransferTx,
  generateUpdateKeysetHashTx,
  SigType,
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

  console.info(
    ` -> ${test} runs: ${values.length} cost min: ${min} max: ${max} avg: ${avg}`
  );
}

describe("ModuleMain Benchmark", function () {
  let factory: Contract;
  let dkimKeys: Contract;
  let moduleMain: Contract;
  let ModuleMain: ContractFactory;
  let chainId: number;
  this.beforeAll(async () => {
    const Factory = await ethers.getContractFactory("Factory");
    factory = await Factory.deploy();

    const DkimKeys = await ethers.getContractFactory("DkimKeys");
    const dkimKeysAdmin = Wallet.createRandom();
    dkimKeys = await DkimKeys.deploy(dkimKeysAdmin.address);

    const ModuleMainUpgradable = await ethers.getContractFactory(
      "ModuleMainUpgradable"
    );
    const moduleMainUpgradable = await ModuleMainUpgradable.deploy(
      dkimKeys.address
    );

    ModuleMain = await ethers.getContractFactory("ModuleMain");
    moduleMain = await ModuleMain.deploy(
      factory.address,
      moduleMainUpgradable.address,
      dkimKeys.address
    );

    chainId = await (await moduleMain.provider.getNetwork()).chainId;
  });

  if (process.env.BENCHMARK) {
    describe.only("BenchMark", function () {
      this.timeout(0);

      it("Deploy A Wallet", async () => {
        let results: number[] = [];
        for (let i = 0; i < runs; i++) {
          const salt = ethers.utils.hexlify(randomBytes(32));
          const ret = await (
            await factory.deploy(moduleMain.address, salt)
          ).wait();
          results.push(ret.gasUsed);
        }
        report("deploy wallets", results);
      });

      it("Relay 1/1 Update KeysetHash transaction", async () => {
        const newKeysetHash = hexlify(randomBytes(32));

        for (const sigType of [
          SigType.SigMasterKey,
          SigType.SigRecoveryEmail,
          SigType.SigMasterKeyWithRecoveryEmail,
        ]) {
          const results: number[] = [];
          for (let i = 0; i < runs; i++) {
            const masterKey = Wallet.createRandom();
            const threshold = 4;
            const recoveryEmails = generateRecoveryEmails(10);
            const keysetHash = getKeysetHash(
              masterKey.address,
              threshold,
              recoveryEmails
            );
            await (await factory.deploy(moduleMain.address, keysetHash)).wait();
            const wallet = ModuleMain.attach(
              getProxyAddress(moduleMain.address, factory.address, keysetHash)
            );

            const transaction = await generateUpdateKeysetHashTx(
              wallet.address,
              newKeysetHash,
              masterKey,
              threshold,
              recoveryEmails,
              sigType
            );

            const tx = await executeUpdateKeysetHash(
              [transaction],
              chainId,
              1,
              masterKey,
              threshold,
              recoveryEmails,
              wallet
            );
            results.push(tx.gasUsed);
          }

          report(`relay 1/1 Update Keyset By ${sigType} transaction`, results);
        }
      });

      it("Relay 1/1 Transfer Eth transaction", async () => {
        const results: number[] = [];
        for (let i = 0; i < runs; i++) {
          const masterKey = Wallet.createRandom();
          const threshold = 4;
          const recoveryEmails = generateRecoveryEmails(10);
          const keysetHash = getKeysetHash(
            masterKey.address,
            threshold,
            recoveryEmails
          );
          await (await factory.deploy(moduleMain.address, keysetHash)).wait();
          const wallet = ModuleMain.attach(
            getProxyAddress(moduleMain.address, factory.address, keysetHash)
          );
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
            masterKey,
            threshold,
            recoveryEmails,
            Wallet.createRandom(),
            Math.ceil(Date.now() + 300),
            wallet
          );
          results.push(tx.gasUsed);
        }
        report(`relay 1/1 Transfer transaction`, results);
      });
    });
  }
});
