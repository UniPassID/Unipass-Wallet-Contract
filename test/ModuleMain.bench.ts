import {
  BigNumber,
  Contract,
  ContractFactory,
  getDefaultProvider,
  Wallet,
} from "ethers";
import { hexlify, id, randomBytes } from "ethers/lib/utils";
import { ethers } from "hardhat";
import {
  generateRecoveryEmails,
  getKeysetHash,
  getProxyAddress,
  transferEth,
} from "./utils/common";
import {
  ActionType,
  CallType,
  generateAccountLayerSignature,
  generateTransactionSig,
  SigType,
  Transaction,
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

export async function generateUpdateKeysetHashTx(
  walletAddr: string,
  newKeysetHash: string,
  masterKey: Wallet,
  threshold: number,
  recoveryEmails: string[],
  sigType: SigType
) {
  const data = await generateAccountLayerSignature(
    walletAddr,
    ActionType.UpdateKeysetHash,
    1,
    undefined,
    newKeysetHash,
    masterKey,
    threshold,
    recoveryEmails,
    sigType
  );
  let tx = {
    callType: CallType.CallAccountLayer,
    gasLimit: ethers.constants.Zero,
    target: ethers.constants.AddressZero,
    value: ethers.constants.Zero,
    data,
  };
  return tx;
}

export async function generateTransferTx(
  gasLimit: BigNumber,
  value: BigNumber
) {
  let tx = {
    callType: CallType.Call,
    gasLimit,
    target: ethers.constants.AddressZero,
    value,
    data: "0x",
  };
  return tx;
}

export async function executeUpdateKeysetHash(
  txs: Transaction[],
  chainId: number,
  nonce: number,
  masterKey: Wallet,
  threshold: number,
  recoveryEmails: string[],
  moduleMain: Contract
) {
  const feeToken = ethers.constants.AddressZero;
  const feeReceiver = ethers.constants.AddressZero;
  const feeAmount = 0;

  const signature = await generateTransactionSig(
    chainId,
    txs,
    nonce,
    feeToken,
    feeAmount,
    masterKey,
    threshold,
    recoveryEmails,
    [...Array(threshold).keys()].map((v) => v + 1),
    undefined,
    undefined,
    SigType.SigNone
  );
  const ret = await (
    await moduleMain.execute(txs, nonce, feeToken, feeReceiver, 0, signature)
  ).wait();
  return ret;
}

export async function executeCall(
  txs: Transaction[],
  chainId: number,
  nonce: number,
  masterKey: Wallet,
  threshold: number,
  recoveryEmails: string[],
  sessionKey: Wallet,
  expired: number,
  moduleMain: Contract
) {
  const feeToken = ethers.constants.AddressZero;
  const feeReceiver = ethers.constants.AddressZero;
  const feeAmount = 0;

  const signature = await generateTransactionSig(
    chainId,
    txs,
    nonce,
    feeToken,
    feeAmount,
    masterKey,
    threshold,
    recoveryEmails,
    [...Array(threshold).keys()].map((v) => v + 1),
    sessionKey,
    expired,
    SigType.SigSessionKey
  );
  const ret = await (
    await moduleMain.execute(txs, nonce, feeToken, feeReceiver, 0, signature)
  ).wait();
  return ret;
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

    ModuleMain = await ethers.getContractFactory("ModuleMain");
    moduleMain = await ModuleMain.deploy(factory.address);

    const DkimKeys = await ethers.getContractFactory("DkimKeys");
    const dkimKeysAdmin = Wallet.createRandom();
    dkimKeys = await DkimKeys.deploy(dkimKeysAdmin.address);

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
            await factory.deploy(moduleMain.address, salt, dkimKeys.address)
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
            await (
              await factory.deploy(
                moduleMain.address,
                keysetHash,
                dkimKeys.address
              )
            ).wait();
            const wallet = ModuleMain.attach(
              getProxyAddress(
                moduleMain.address,
                dkimKeys.address,
                factory.address,
                keysetHash
              )
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
          await (
            await factory.deploy(
              moduleMain.address,
              keysetHash,
              dkimKeys.address
            )
          ).wait();
          const wallet = ModuleMain.attach(
            getProxyAddress(
              moduleMain.address,
              dkimKeys.address,
              factory.address,
              keysetHash
            )
          );
          await transferEth(wallet.address, 1);

          const transaction = await generateTransferTx(
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
