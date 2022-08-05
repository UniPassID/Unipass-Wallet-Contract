import { Contract, ContractFactory, Overrides, Wallet } from "ethers";
import { hexlify, randomBytes } from "ethers/lib/utils";
import { ethers } from "hardhat";
import {
  generateRecoveryEmails,
  getKeysetHash,
  transferEth,
} from "./utils/common";
import { Deployer } from "./utils/deployer";
import {
  executeCall,
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
  let deployer: Deployer;
  let dkimKeys: Contract;
  let moduleMain: Contract;
  let ModuleMain: ContractFactory;
  let chainId: number;
  let txParams: Overrides;
  this.beforeAll(async () => {
    const [signer] = await ethers.getSigners();
    deployer = await new Deployer(signer).init();
    txParams = {
      gasLimit: 6000000,
      gasPrice: (await signer.getGasPrice()).mul(12).div(10),
    };

    const instance = 0;

    const DkimKeys = await ethers.getContractFactory("DkimKeys");
    const dkimKeysAdmin = Wallet.createRandom();
    dkimKeys = await deployer.deployContract(
      DkimKeys,
      instance,
      txParams,
      dkimKeysAdmin.address
    );

    const ModuleMainUpgradable = await ethers.getContractFactory(
      "ModuleMainUpgradable"
    );
    const moduleMainUpgradable = await deployer.deployContract(
      ModuleMainUpgradable,
      instance,
      txParams,
      dkimKeys.address
    );

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
  });

  if (process.env.BENCHMARK) {
    describe.only("BenchMark", function () {
      this.timeout(0);

      it("Deploy A Wallet", async () => {
        let results: number[] = [];
        for (let i = 0; i < runs; i++) {
          const salt = ethers.utils.hexlify(randomBytes(32));
          const ret = await (
            await deployer.singleFactoryContract.deploy(
              Deployer.getInitCode(moduleMain.address),
              salt,
              txParams
            )
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
            const recoveryEmailIndexes = [...Array(threshold).keys()].map(
              (v) => v + 1
            );
            const recoveryEmails = generateRecoveryEmails(10);
            const keysetHash = getKeysetHash(
              masterKey.address,
              threshold,
              recoveryEmails
            );
            const wallet = await deployer.deployProxyContract(
              moduleMain.interface,
              moduleMain.address,
              keysetHash,
              txParams
            );

            const transaction = await generateUpdateKeysetHashTx(
              wallet,
              1,
              newKeysetHash,
              masterKey,
              threshold,
              recoveryEmailIndexes,
              recoveryEmails,
              sigType
            );

            const tx = await executeCall(
              [transaction],
              chainId,
              1,
              masterKey,
              threshold,
              recoveryEmails,
              Wallet.createRandom(),
              Math.ceil(Date.now() / 1000) + 5000,
              wallet,
              SigType.SigSessionKey
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
          const wallet = await deployer.deployProxyContract(
            moduleMain.interface,
            moduleMain.address,
            keysetHash,
            txParams
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
            wallet,
            SigType.SigSessionKey
          );
          results.push(tx.gasUsed);
        }
        report(`relay 1/1 Transfer transaction`, results);
      });
    });
  }
});
