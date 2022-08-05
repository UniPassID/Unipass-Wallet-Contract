import { expect } from "chai";
import { Contract, ContractFactory, Overrides, Wallet } from "ethers";
import { hexlify, randomBytes, solidityPack } from "ethers/lib/utils";
import { ethers } from "hardhat";
import {
  generateRecoveryEmails,
  getKeysetHash,
  optimalGasLimit,
  transferEth,
} from "./utils/common";
import { Deployer } from "./utils/deployer";
import { generateAddHookTx, generateRemoveHookTx } from "./utils/hook";
import {
  executeCall,
  generateCancelLockKeysetHashTx,
  generateSignature,
  generateTransferTx,
  generateUnlockKeysetHashTx,
  generateUpdateEntryPointTx,
  generateUpdateImplementationTx,
  generateUpdateKeysetHashTx,
  generateUpdateTimeLockDuringTx,
  SigType,
} from "./utils/sigPart";
import { DefaultsForUserOp, UserOperation } from "./utils/userOperation";

describe("ModuleCall", function () {
  let testModuleCall: Contract;
  let TestModuleCall: ContractFactory;
  let entryPoint: Wallet;
  let proxyTestModuleCall: Contract;
  let deployer: Deployer;
  let dkimKeys: Contract;
  let masterKey: Wallet;
  let keysetHash: string;
  let threshold: number;
  let recoveryEmails: string[];
  let wallet: Wallet;
  let chainId: number;
  let txParams: Overrides;
  let recoveryEmailsIndexes: number[];
  let nonce: number;
  let metaNonce: number;
  this.beforeAll(async function () {
    const [signer] = await ethers.getSigners();
    deployer = await new Deployer(signer).init();

    txParams = {
      gasLimit: 6000000,
      gasPrice: (await signer.provider?.getGasPrice())?.mul(12).div(10),
    };

    const DkimKeys = await ethers.getContractFactory("DkimKeys");
    wallet = Wallet.createRandom();
    dkimKeys = await deployer.deployContract(
      DkimKeys,
      0,
      txParams,
      wallet.address
    );

    entryPoint = Wallet.createRandom().connect(dkimKeys.provider);
    await transferEth(entryPoint.address, 10);

    const ModuleMainUpgradable = await ethers.getContractFactory(
      "ModuleMainUpgradable"
    );
    const moduleMainUpgradable = await deployer.deployContract(
      ModuleMainUpgradable,
      0,
      txParams,
      dkimKeys.address,
      entryPoint.address
    );

    TestModuleCall = await ethers.getContractFactory("TestModuleCall");
    testModuleCall = await deployer.deployContract(
      TestModuleCall,
      0,
      txParams,
      deployer.singleFactoryContract.address,
      moduleMainUpgradable.address,
      dkimKeys.address,
      entryPoint.address
    );

    chainId = (await dkimKeys.provider.getNetwork()).chainId;
  });
  this.beforeEach(async function () {
    threshold = 4;
    masterKey = Wallet.createRandom();

    recoveryEmailsIndexes = [...Array(threshold).keys()].map((v) => v + 1);
    recoveryEmails = generateRecoveryEmails(10);
    keysetHash = getKeysetHash(masterKey.address, threshold, recoveryEmails);

    proxyTestModuleCall = await deployer.deployProxyContract(
      TestModuleCall.interface,
      testModuleCall.address,
      keysetHash,
      txParams
    );
    const txRet = await (
      await ethers.getSigners()
    )[0].sendTransaction({
      to: proxyTestModuleCall.address,
      value: ethers.utils.parseEther("100"),
    });
    expect((await txRet.wait()).status).to.equal(1);
    nonce = 1;
    metaNonce = 1;
  });
  describe("Test For ModuleAuthFixed And ModuleAuthUpgradable", () => {
    ["ModuleAuthFixed", "ModuleAuthUpgradable"].forEach(async (module) => {
      const init = async () => {
        if (module === "ModuleAuthUpgradable") {
          const newMasterKey = Wallet.createRandom();
          const newRecoveryEmails = generateRecoveryEmails(10);
          const newKeysetHash = getKeysetHash(
            newMasterKey.address,
            threshold,
            newRecoveryEmails
          );
          const tx = await generateUpdateKeysetHashTx(
            proxyTestModuleCall,
            metaNonce,
            newKeysetHash,
            masterKey,
            threshold,
            recoveryEmailsIndexes,
            recoveryEmails,
            SigType.SigMasterKeyWithRecoveryEmail
          );
          const ret = await executeCall(
            [tx],
            chainId,
            nonce,
            masterKey,
            threshold,
            recoveryEmails,
            Wallet.createRandom(),
            Math.ceil(Date.now() / 1000) + 500,
            proxyTestModuleCall,
            SigType.SigNone
          );
          expect(ret.status).to.equals(1);
          metaNonce++;
          nonce++;
          masterKey = newMasterKey;
          recoveryEmails = newRecoveryEmails;
          keysetHash = newKeysetHash;
        }
      };

      it(`Update KeysetHash By Single Master Key For ${module}`, async function () {
        await init();
        const newKeysetHash = Wallet.createRandom().privateKey;
        const tx = await generateUpdateKeysetHashTx(
          proxyTestModuleCall,
          metaNonce,
          newKeysetHash,
          masterKey,
          threshold,
          recoveryEmailsIndexes,
          recoveryEmails,
          SigType.SigMasterKey
        );
        const ret = await executeCall(
          [tx],
          chainId,
          nonce,
          masterKey,
          threshold,
          recoveryEmails,
          Wallet.createRandom(),
          Math.ceil(Date.now() / 1000) + 500,
          proxyTestModuleCall,
          SigType.SigNone
        );
        expect(ret.status).to.equal(1);
        expect(await proxyTestModuleCall.isLocked()).to.true;
        expect(await proxyTestModuleCall.lockedKeysetHash()).to.equal(
          newKeysetHash
        );
        expect(await proxyTestModuleCall.getNonce()).to.equals(nonce);
        expect(await proxyTestModuleCall.getMetaNonce()).to.equals(metaNonce);
        metaNonce++;
        nonce++;
      });
      it(`Update KeysetHash By Recovery Email For ${module}`, async function () {
        await init();
        const newKeysetHash = Wallet.createRandom().privateKey;
        const tx = await generateUpdateKeysetHashTx(
          proxyTestModuleCall,
          metaNonce,
          newKeysetHash,
          masterKey,
          threshold,
          recoveryEmailsIndexes,
          recoveryEmails,
          SigType.SigRecoveryEmail
        );
        const ret = await executeCall(
          [tx],
          chainId,
          nonce,
          masterKey,
          threshold,
          recoveryEmails,
          Wallet.createRandom(),
          Math.ceil(Date.now() / 1000) + 500,
          proxyTestModuleCall,
          SigType.SigNone
        );
        expect(ret.status).to.equal(1);
        expect(await proxyTestModuleCall.isLocked()).to.true;
        expect(await proxyTestModuleCall.lockedKeysetHash()).to.equal(
          newKeysetHash
        );
        expect(await proxyTestModuleCall.getNonce()).to.equals(nonce);
        expect(await proxyTestModuleCall.getMetaNonce()).to.equals(metaNonce);
        metaNonce++;
        nonce++;
      });
      it(`Update KeysetHash By Master Key And Recovery Email For ${module}`, async function () {
        await init();
        const newKeysetHash = Wallet.createRandom().privateKey;
        const tx = await generateUpdateKeysetHashTx(
          proxyTestModuleCall,
          metaNonce,
          newKeysetHash,
          masterKey,
          threshold,
          recoveryEmailsIndexes,
          recoveryEmails,
          SigType.SigMasterKeyWithRecoveryEmail
        );
        const ret = await executeCall(
          [tx],
          chainId,
          nonce,
          masterKey,
          threshold,
          recoveryEmails,
          Wallet.createRandom(),
          Math.ceil(Date.now() / 1000) + 500,
          proxyTestModuleCall,
          SigType.SigNone
        );
        expect(ret.status).to.equal(1);
        expect(await proxyTestModuleCall.isLocked()).to.false;
        expect(await proxyTestModuleCall.getKeysetHash()).to.equal(
          newKeysetHash
        );
        expect(await proxyTestModuleCall.getNonce()).to.equals(nonce);
        expect(await proxyTestModuleCall.getMetaNonce()).to.equals(metaNonce);
        nonce++;
        metaNonce++;
      });
      it(`UnLock KeysetHash TimeLock For ${module}`, async function () {
        await init();
        // Update Delay To 3
        const newDelay = 3;
        let tx = await generateUpdateTimeLockDuringTx(
          proxyTestModuleCall,
          metaNonce,
          newDelay,
          masterKey,
          threshold,
          recoveryEmailsIndexes,
          recoveryEmails,
          SigType.SigMasterKey
        );
        let ret = await executeCall(
          [tx],
          chainId,
          nonce,
          masterKey,
          threshold,
          recoveryEmails,
          Wallet.createRandom(),
          Math.ceil(Date.now() / 1000) + 500,
          proxyTestModuleCall,
          SigType.SigNone
        );
        expect(ret.status).to.equal(1);
        expect(await proxyTestModuleCall.isLocked()).to.false;
        expect(await proxyTestModuleCall.getLockDuring()).to.equal(newDelay);
        expect(await proxyTestModuleCall.getNonce()).to.equals(nonce);
        expect(await proxyTestModuleCall.getMetaNonce()).to.equals(metaNonce);
        nonce++;
        metaNonce++;

        const newKeysetHash = hexlify(randomBytes(32));
        tx = await generateUpdateKeysetHashTx(
          proxyTestModuleCall,
          metaNonce,
          newKeysetHash,
          masterKey,
          threshold,
          recoveryEmailsIndexes,
          recoveryEmails,
          SigType.SigRecoveryEmail
        );
        ret = await executeCall(
          [tx],
          chainId,
          nonce,
          masterKey,
          threshold,
          recoveryEmails,
          Wallet.createRandom(),
          Math.ceil(Date.now() / 1000) + 500,
          proxyTestModuleCall,
          SigType.SigNone
        );
        expect(ret.status).to.equal(1);
        expect(await proxyTestModuleCall.isLocked()).to.true;
        expect(await proxyTestModuleCall.lockedKeysetHash()).to.equal(
          newKeysetHash
        );
        expect(await proxyTestModuleCall.getKeysetHash()).not.to.equal(
          newKeysetHash
        );
        expect(await proxyTestModuleCall.getNonce()).to.equals(nonce);
        expect(await proxyTestModuleCall.getMetaNonce()).to.equals(metaNonce);
        nonce++;
        metaNonce++;

        await new Promise((resolve) =>
          setTimeout(resolve, newDelay * 1000 + 1000)
        );
        tx = await generateUnlockKeysetHashTx(
          proxyTestModuleCall,
          metaNonce,
          proxyTestModuleCall.interface
        );
        ret = await executeCall(
          [tx],
          chainId,
          nonce,
          masterKey,
          threshold,
          recoveryEmails,
          Wallet.createRandom(),
          Math.ceil(Date.now() / 1000) + 500,
          proxyTestModuleCall,
          SigType.SigNone
        );
        expect(ret.status).to.equal(1);
        expect(await proxyTestModuleCall.getKeysetHash()).to.equals(
          newKeysetHash
        );
        expect(await proxyTestModuleCall.getNonce()).to.equals(nonce);
        expect(await proxyTestModuleCall.getMetaNonce()).to.equals(metaNonce);
        nonce++;
        metaNonce++;
      });

      it(`Cancel KeysetHash TimeLock For ${module}`, async function () {
        await init();
        const newKeysetHash = hexlify(randomBytes(32));
        let tx = await generateUpdateKeysetHashTx(
          proxyTestModuleCall,
          metaNonce,
          newKeysetHash,
          masterKey,
          threshold,
          recoveryEmailsIndexes,
          recoveryEmails,
          SigType.SigRecoveryEmail
        );
        let ret = await executeCall(
          [tx],
          chainId,
          nonce,
          masterKey,
          threshold,
          recoveryEmails,
          Wallet.createRandom(),
          Math.ceil(Date.now() / 1000) + 500,
          proxyTestModuleCall,
          SigType.SigNone
        );
        expect(ret.status).to.equal(1);
        expect(await proxyTestModuleCall.isLocked()).to.true;
        expect(await proxyTestModuleCall.lockedKeysetHash()).to.equal(
          newKeysetHash
        );
        expect(await proxyTestModuleCall.getKeysetHash()).not.to.equal(
          newKeysetHash
        );
        expect(await proxyTestModuleCall.getNonce()).to.equals(nonce);
        expect(await proxyTestModuleCall.getMetaNonce()).to.equals(metaNonce);
        nonce++;
        metaNonce++;

        tx = await generateCancelLockKeysetHashTx(
          proxyTestModuleCall,
          metaNonce,
          masterKey,
          threshold,
          recoveryEmailsIndexes,
          recoveryEmails,
          SigType.SigMasterKey
        );
        ret = await executeCall(
          [tx],
          chainId,
          nonce,
          masterKey,
          threshold,
          recoveryEmails,
          Wallet.createRandom(),
          Math.ceil(Date.now() / 1000) + 500,
          proxyTestModuleCall,
          SigType.SigNone
        );
        expect(ret.status).to.equal(1);
        expect(await proxyTestModuleCall.isLocked()).to.false;
        expect(await proxyTestModuleCall.getMetaNonce()).to.equals(metaNonce);
        expect(await proxyTestModuleCall.getNonce()).to.equals(nonce);
        expect(await proxyTestModuleCall.getMetaNonce()).to.equals(metaNonce);
        nonce++;
        metaNonce++;
      });
      it(`Update TimeLock LockDuring For ${module}`, async function () {
        await init();
        const newDelay = 2;

        let tx = await generateUpdateTimeLockDuringTx(
          proxyTestModuleCall,
          metaNonce,
          newDelay,
          masterKey,
          threshold,
          recoveryEmailsIndexes,
          recoveryEmails,
          SigType.SigRecoveryEmail
        );
        let ret = await executeCall(
          [tx],
          chainId,
          nonce,
          masterKey,
          threshold,
          recoveryEmails,
          Wallet.createRandom(),
          Math.ceil(Date.now() / 1000) + 500,
          proxyTestModuleCall,
          SigType.SigNone
        );
        expect(ret.status).to.equal(1);
        expect(await proxyTestModuleCall.isLocked()).to.false;
        expect(await proxyTestModuleCall.getLockDuring()).to.equal(newDelay);
        expect(await proxyTestModuleCall.getNonce()).to.equals(nonce);
        expect(await proxyTestModuleCall.getMetaNonce()).to.equals(metaNonce);
        nonce++;
        metaNonce++;
      });
      it(`Update Implementation For ${module}`, async function () {
        await init();
        const Greeter = await ethers.getContractFactory("Greeter");
        const greeter = await Greeter.deploy();

        const tx = await generateUpdateImplementationTx(
          proxyTestModuleCall,
          metaNonce,
          greeter.address,
          masterKey,
          threshold,
          recoveryEmailsIndexes,
          recoveryEmails
        );
        let ret = await executeCall(
          [tx],
          chainId,
          nonce,
          masterKey,
          threshold,
          recoveryEmails,
          Wallet.createRandom(),
          Math.ceil(Date.now() / 1000) + 500,
          proxyTestModuleCall,
          SigType.SigNone
        );
        expect(ret.status).to.equal(1);
        proxyTestModuleCall = Greeter.attach(proxyTestModuleCall.address);
        expect(await proxyTestModuleCall.ret1()).to.equals(1);
      });

      it(`Update EntryPoint For ${module}`, async function () {
        await init();
        const newEntryPoint = await (
          await ethers.getContractFactory("Greeter")
        ).deploy();

        const tx = await generateUpdateEntryPointTx(
          proxyTestModuleCall,
          metaNonce,
          newEntryPoint.address,
          masterKey,
          threshold,
          recoveryEmailsIndexes,
          recoveryEmails
        );
        let ret = await executeCall(
          [tx],
          chainId,
          nonce,
          masterKey,
          threshold,
          recoveryEmails,
          Wallet.createRandom(),
          Math.ceil(Date.now() / 1000) + 500,
          proxyTestModuleCall,
          SigType.SigNone
        );
        expect(ret.status).to.equal(1);
        expect(await proxyTestModuleCall.getEntryPoint()).to.equals(
          newEntryPoint.address
        );
        expect(await proxyTestModuleCall.getNonce()).to.equals(nonce);
        expect(await proxyTestModuleCall.getMetaNonce()).to.equals(metaNonce);
        nonce++;
        metaNonce++;
      });
    });
  });

  describe("Test ModuleHooks Transaction", () => {
    let testERC721: Contract;
    let testERC721Admin: Wallet;
    let testERC721Owner1: Wallet;
    let ERC721TokenId1: string;
    let testERC1155: Contract;
    let testERC1155Admin: Wallet;
    let testERC1155Owner1: Wallet;
    let ERC1155TokenId1: string;
    let testERC20: Contract;
    let testERC20Admin: Wallet;
    let testERC20Owner1: Wallet;
    let greeter: Contract;
    this.beforeAll(async function () {
      const TestERC721 = await ethers.getContractFactory("TestERC721");
      testERC721 = await TestERC721.deploy();
      testERC721Admin = Wallet.createRandom().connect(testERC721.provider);
      await testERC721.transferOwnership(testERC721Admin.address);
      testERC721 = testERC721.connect(testERC721Admin);
      testERC721Owner1 = Wallet.createRandom().connect(testERC721.provider);
      await transferEth(testERC721Admin.address, 100);
      await transferEth(testERC721Owner1.address, 100);
      await testERC721.safeMint(testERC721Owner1.address);
      ERC721TokenId1 = await testERC721.tokenOfOwnerByIndex(
        testERC721Owner1.address,
        0
      );
    });
    this.beforeAll(async function () {
      const TestERC1155 = await ethers.getContractFactory("TestERC1155");
      testERC1155 = await TestERC1155.deploy();
      testERC1155Admin = Wallet.createRandom().connect(testERC1155.provider);
      await testERC1155.transferOwnership(testERC1155Admin.address);
      testERC1155 = testERC1155.connect(testERC1155Admin);
      testERC1155Owner1 = Wallet.createRandom().connect(testERC1155.provider);
      await transferEth(testERC1155Admin.address, 100);
      await transferEth(testERC1155Owner1.address, 100);
      ERC1155TokenId1 = Wallet.createRandom().privateKey;
      await testERC1155.mint(
        testERC1155Owner1.address,
        ERC1155TokenId1,
        100,
        "0x"
      );
    });
    this.beforeAll(async function () {
      const TestERC20 = await ethers.getContractFactory("TestERC20");
      testERC20 = await TestERC20.deploy();
      testERC20Admin = Wallet.createRandom().connect(testERC20.provider);
      await testERC20.transferOwnership(testERC20Admin.address);
      testERC20 = testERC20.connect(testERC20Admin);
      testERC20Owner1 = Wallet.createRandom().connect(testERC20.provider);
      await transferEth(testERC20Admin.address, 100);
      await transferEth(testERC20Owner1.address, 100);
      await testERC20.mint(testERC20Owner1.address, 100);
    });
    this.beforeAll(async function () {
      const Greeter = await ethers.getContractFactory("Greeter");
      greeter = await Greeter.deploy();
    });
    it("Test ERC721 Transfer", async function () {
      const ret = await (
        await testERC721
          .connect(testERC721Owner1)
          .transferFrom(
            testERC721Owner1.address,
            proxyTestModuleCall.address,
            ERC721TokenId1
          )
      ).wait();
      expect(ret.status).to.equal(1);
      expect(await testERC721.ownerOf(ERC721TokenId1)).to.equal(
        proxyTestModuleCall.address
      );
    });

    it("Test ERC1155 Transfer", async function () {
      const value = 10;
      const ret = await (
        await testERC1155
          .connect(testERC1155Owner1)
          .safeTransferFrom(
            testERC1155Owner1.address,
            proxyTestModuleCall.address,
            ERC1155TokenId1,
            value,
            "0x"
          )
      ).wait();
      expect(ret.status).to.equal(1);
      expect(
        await testERC1155.balanceOf(
          proxyTestModuleCall.address,
          ERC1155TokenId1
        )
      ).equal(value);
    });

    it("Test ERC20 Transfer", async function () {
      const value = 10;
      const ret = await (
        await testERC20
          .connect(testERC20Owner1)
          .transfer(proxyTestModuleCall.address, value)
      ).wait();
      expect(ret.status).to.equal(1);
      expect(await testERC20.balanceOf(proxyTestModuleCall.address)).equal(
        value
      );
    });

    it("Test ETH Transfer", async function () {
      const oldValue = await proxyTestModuleCall.provider.getBalance(
        proxyTestModuleCall.address
      );
      const value = 10;
      const ret = await transferEth(proxyTestModuleCall.address, value);
      expect(ret.status).to.equal(1);
      expect(
        await proxyTestModuleCall.provider.getBalance(
          proxyTestModuleCall.address
        )
      ).equal(ethers.utils.parseEther(value.toString()).add(oldValue));
    });
    it("Test Greeter Hook", async function () {
      const selector = greeter.interface.getSighash("ret1");
      let tx = generateAddHookTx(
        proxyTestModuleCall,
        selector,
        greeter.address
      );
      let ret = await executeCall(
        [tx],
        chainId,
        nonce,
        masterKey,
        threshold,
        recoveryEmails,
        Wallet.createRandom(),
        Math.ceil(Date.now() / 1000) + 300,
        proxyTestModuleCall,
        SigType.SigMasterKeyWithRecoveryEmail
      );
      expect(ret.status).to.equal(1);
      ret = await proxyTestModuleCall.readHook(selector);
      expect(ret).to.equal(greeter.address);
      const data = greeter.interface.encodeFunctionData("ret1");
      ret = await (
        await ethers.getSigners()
      )[0].call({ to: proxyTestModuleCall.address, data });
      expect(ret).equal(solidityPack(["uint256"], [1]));
      expect(await proxyTestModuleCall.getNonce()).to.equals(nonce);
      nonce++;

      tx = generateRemoveHookTx(proxyTestModuleCall, selector);
      ret = await executeCall(
        [tx],
        chainId,
        nonce,
        masterKey,
        threshold,
        recoveryEmails,
        Wallet.createRandom(),
        Math.ceil(Date.now() / 1000) + 300,
        proxyTestModuleCall,
        SigType.SigMasterKeyWithRecoveryEmail
      );
      expect(ret.status).to.equal(1);
      ret = await proxyTestModuleCall.readHook(selector);
      expect(ret).to.equal(ethers.constants.AddressZero);
      expect(await proxyTestModuleCall.getNonce()).to.equals(nonce);
      nonce++;
    });
  });

  it("Test Multiple Transactions", async function () {
    const to = Wallet.createRandom();
    const value = ethers.utils.parseEther("10");
    const newKeysetHash = `0x${Buffer.from(randomBytes(32)).toString("hex")}`;
    const tx1 = await generateUpdateKeysetHashTx(
      proxyTestModuleCall,
      metaNonce,
      newKeysetHash,
      masterKey,
      threshold,
      recoveryEmailsIndexes,
      recoveryEmails,
      SigType.SigMasterKey
    );
    const tx2 = await generateTransferTx(
      to.address,
      ethers.constants.Zero,
      value
    );

    const nonce = 1;
    const sessionKey = Wallet.createRandom();

    const ret = await executeCall(
      [tx1, tx2],
      chainId,
      nonce,
      masterKey,
      threshold,
      recoveryEmails,
      sessionKey,
      Math.ceil(Date.now() / 1000) + 300,
      proxyTestModuleCall,
      SigType.SigSessionKey
    );

    expect(ret.status).to.equal(1);
    expect(await proxyTestModuleCall.provider.getBalance(to.address)).equal(
      value
    );
    expect(await proxyTestModuleCall.lockedKeysetHash()).to.equal(
      newKeysetHash
    );
  });
  it("Execute From EntryPoint Should Success", async function () {
    const to = Wallet.createRandom();
    const value = ethers.utils.parseEther("10");
    let tx = await generateTransferTx(to.address, optimalGasLimit, value);
    const ret = await (
      await proxyTestModuleCall.connect(entryPoint).execFromEntryPoint(tx, 1)
    ).wait();
    expect(ret.status).to.equals(1);
    expect(await proxyTestModuleCall.provider.getBalance(to.address)).to.equals(
      ethers.utils.parseEther("10")
    );
    expect(await proxyTestModuleCall.getNonce()).to.equals(0);
  });
  it("Validate User Op Should Success", async function () {
    const to = Wallet.createRandom();
    const value = ethers.utils.parseEther("10");
    let op: UserOperation = DefaultsForUserOp;
    let tx = await generateTransferTx(to.address, optimalGasLimit, value);
    const requestId = hexlify(randomBytes(32));
    const sessionKey = Wallet.createRandom();
    const expired = Math.ceil(Date.now() / 1000) + 300;
    op.callData = proxyTestModuleCall.interface.encodeFunctionData(
      "execFromEntryPoint",
      [tx, 1]
    );
    op.sender = proxyTestModuleCall.address;
    op.signature = await generateSignature(
      SigType.SigSessionKey,
      requestId,
      sessionKey,
      expired,
      masterKey,
      threshold,
      recoveryEmailsIndexes,
      recoveryEmails
    );
    op.nonce = 1;
    const ret = await (
      await proxyTestModuleCall
        .connect(entryPoint)
        .validateUserOp(op, requestId, 0)
    ).wait();
    expect(ret.status).to.equals(1);
    expect(await proxyTestModuleCall.getNonce()).to.equals(1);
  });
});
