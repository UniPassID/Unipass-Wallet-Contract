import { expect } from "chai";
import { constants, Contract, ContractFactory, Overrides, Wallet } from "ethers";
import { formatBytes32String, hexlify, keccak256, randomBytes, solidityPack, toUtf8Bytes } from "ethers/lib/utils";
import { ethers } from "hardhat";
import NodeRSA from "node-rsa";
import {
  ASSETS_OP_THRESHOLD,
  getKeysetHash,
  GUARDIAN_THRESHOLD,
  GUARDIAN_TIMELOCK_THRESHOLD,
  initDkimZK,
  OPENID_AUDIENCE,
  OPENID_ISSUER,
  OPENID_KID,
  OWNER_CANCEL_TIMELOCK_THRESHOLD,
  OWNER_THRESHOLD,
  SELECTOR_ERC1271_BYTES32_BYTES,
  transferEth,
} from "./utils/common";
import { Deployer } from "./utils/deployer";
import { generateAddHookTx, generateRemoveHookTx } from "./utils/hook";
import { selectKeys, KeyBase, randomKeys } from "./utils/key";
import {
  CallType,
  executeCall,
  generateAddPermissionTx,
  generateCancelLockKeysetHashTx,
  generateSignature,
  generateTransactionHash,
  generateTransferTx,
  generateUnlockKeysetHashTx,
  generateUpdateEntryPointTx,
  generateUpdateImplementationTx,
  generateUpdateKeysetHashTx,
  generateUpdateTimeLockDuringTx,
  parseTxs,
  Role,
  Transaction,
} from "./utils/sigPart";
import { DefaultsForUserOp } from "./utils/userOperation";

describe("ModuleCall", function () {
  let testModuleCall: Contract;
  let TestModuleCall: ContractFactory;
  let proxyTestModuleCall: Contract;
  let deployer: Deployer;
  let dkimKeys: Contract;
  let keys: KeyBase[];
  let keysetHash: string;
  let dkimKeysAdmin: Wallet;
  let dkimZKAdmin: Wallet;
  let dkimZK: Contract;
  let chainId: number;
  let txParams: Overrides;
  let nonce: number;
  let metaNonce: number;
  let unipassPrivateKey: NodeRSA;
  let testERC1271Wallet: [Contract, Wallet][] = [];
  let Greeter: ContractFactory;
  let greeter1: Contract;
  let greeter2: Contract;
  let moduleWhiteList: Contract;
  let openIDAdmin: Wallet;
  let openID: Contract;
  const zkServerUrl = process.env.ZK_SERVER_URL;
  this.beforeAll(async function () {
    const TestERC1271Wallet = await ethers.getContractFactory("TestERC1271Wallet");
    const [signer] = await ethers.getSigners();
    deployer = await new Deployer(signer).init();

    txParams = {
      gasLimit: 10000000,
      gasPrice: (await signer.provider?.getGasPrice())?.mul(12).div(10),
    };

    for (let i = 0; i < 20; i++) {
      const wallet = Wallet.createRandom();
      testERC1271Wallet.push([await deployer.deployContract(TestERC1271Wallet, i, txParams, wallet.address), wallet]);
    }

    Greeter = await ethers.getContractFactory("Greeter");
    greeter1 = await Greeter.deploy();
    greeter2 = await Greeter.deploy();

    const moduleWhiteListAdmin: Wallet = Wallet.createRandom().connect(signer.provider!);
    await transferEth(moduleWhiteListAdmin.address, 1);
    const ModuleWhiteList = (await ethers.getContractFactory("ModuleWhiteList")).connect(moduleWhiteListAdmin);
    moduleWhiteList = await ModuleWhiteList.deploy(moduleWhiteListAdmin.address);
    let ret = await (await moduleWhiteList.updateImplementationWhiteList(greeter1.address, true)).wait();
    expect(ret.status).to.equals(1);
    ret = await (await moduleWhiteList.updateHookWhiteList(greeter2.address, true)).wait();
    expect(ret.status).to.equals(1);

    const DkimZK = await ethers.getContractFactory("DkimZK");
    dkimZKAdmin = Wallet.createRandom().connect(signer.provider!);
    await transferEth(dkimZKAdmin.address, 10);
    dkimZK = (await deployer.deployContract(DkimZK, 0, txParams, dkimZKAdmin.address)).connect(dkimZKAdmin);
    await initDkimZK(dkimZK);

    const DkimKeys = await ethers.getContractFactory("DkimKeys");
    dkimKeysAdmin = Wallet.createRandom().connect(signer.provider!);
    await transferEth(dkimKeysAdmin.address, 10);
    dkimKeys = await deployer.deployContract(DkimKeys, 0, txParams, dkimKeysAdmin.address, dkimZK.address);

    const OpenID = await ethers.getContractFactory("OpenID");
    openIDAdmin = Wallet.createRandom().connect(signer.provider!);
    await transferEth(openIDAdmin.address, 10);
    openID = (await deployer.deployContract(OpenID, 0, txParams, openIDAdmin.address)).connect(openIDAdmin);

    const ERC1967 = await ethers.getContractFactory("ERC1967Proxy");
    const calldata = OpenID.interface.encodeFunctionData("initialize");
    const erc1967 = await deployer.deployContract(ERC1967, 0, txParams, openID.address, calldata);
    openID = openID.attach(erc1967.address);

    const ModuleMainUpgradable = await ethers.getContractFactory("ModuleMainUpgradable");
    const moduleMainUpgradable = await deployer.deployContract(
      ModuleMainUpgradable,
      0,
      txParams,
      dkimKeys.address,
      openID.address,
      moduleWhiteList.address
    );
    ret = await (await moduleWhiteList.updateImplementationWhiteList(moduleMainUpgradable.address, true)).wait();
    expect(ret.status).to.equals(1);

    TestModuleCall = await ethers.getContractFactory("TestModuleCall");
    testModuleCall = await deployer.deployContract(
      TestModuleCall,
      0,
      txParams,
      deployer.singleFactoryContract.address,
      moduleMainUpgradable.address,
      dkimKeys.address,
      openID.address,
      moduleWhiteList.address
    );

    chainId = (await dkimKeys.provider.getNetwork()).chainId;
    unipassPrivateKey = new NodeRSA({ b: 2048 });
    ret = await (
      await dkimKeys
        .connect(dkimKeysAdmin)
        .updateDKIMKey(
          solidityPack(["bytes32", "bytes32"], [formatBytes32String("s2055"), formatBytes32String("unipass.com")]),
          unipassPrivateKey.exportKey("components-public").n.subarray(1)
        )
    ).wait();
    expect(ret.status).to.equals(1);
    ret = await (
      await openID.updateOpenIDPublicKey(
        keccak256(solidityPack(["bytes", "bytes"], [toUtf8Bytes(OPENID_ISSUER), toUtf8Bytes(OPENID_KID)])),
        unipassPrivateKey.exportKey("components-public").n.slice(1)
      )
    ).wait();
    expect(ret.status).to.equals(1);
    ret = await (
      await openID.addOpenIDAudience(
        keccak256(solidityPack(["bytes", "bytes"], [toUtf8Bytes(OPENID_ISSUER), toUtf8Bytes(OPENID_AUDIENCE)]))
      )
    ).wait();
    expect(ret.status).to.equals(1);
  });
  this.beforeEach(async function () {
    keys = await randomKeys(unipassPrivateKey, testERC1271Wallet, zkServerUrl);
    keysetHash = getKeysetHash(keys);

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
          const newKeys = await randomKeys(unipassPrivateKey, testERC1271Wallet, zkServerUrl);
          const newKeysetHash = getKeysetHash(newKeys);
          const selectedKeys = selectKeys(keys, Role.Owner, OWNER_THRESHOLD);
          const tx = await generateUpdateKeysetHashTx(
            chainId,
            proxyTestModuleCall,
            metaNonce,
            newKeysetHash,
            false,
            Role.Owner,
            selectedKeys
          );
          const ret = await executeCall([tx], chainId, nonce, [], proxyTestModuleCall, undefined, txParams);
          expect(ret.status).to.equals(1);
          metaNonce++;
          nonce++;
          keysetHash = newKeysetHash;
          keys = newKeys;
        }
      };

      it(`Update KeysetHash By Owner For ${module}`, async function () {
        await init();
        const newKeysetHash = Wallet.createRandom().privateKey;
        let selectedKeys = selectKeys(keys, Role.Owner, OWNER_THRESHOLD);
        const tx = await generateUpdateKeysetHashTx(
          chainId,
          proxyTestModuleCall,
          metaNonce,
          newKeysetHash,
          false,
          Role.Owner,
          selectedKeys
        );
        const ret = await executeCall([tx], chainId, nonce, [], proxyTestModuleCall, undefined, txParams);
        expect(ret.status).to.equal(1);
        const lockInfo = await proxyTestModuleCall.getLockInfo();
        expect(lockInfo.isLockedRet).to.false;
        expect(await proxyTestModuleCall.getKeysetHash()).to.equal(newKeysetHash);
        expect(await proxyTestModuleCall.getNonce()).to.equals(nonce);
        expect(await proxyTestModuleCall.getMetaNonce()).to.equals(metaNonce);
        metaNonce++;
        nonce++;
      });
      it(`Update KeysetHash Without TimeLock By Guardian For ${module}`, async function () {
        await init();
        const newKeysetHash = Wallet.createRandom().privateKey;
        let selectedKeys = selectKeys(keys, Role.Guardian, GUARDIAN_THRESHOLD);
        const tx = await generateUpdateKeysetHashTx(
          chainId,
          proxyTestModuleCall,
          metaNonce,
          newKeysetHash,
          false,
          Role.Guardian,
          selectedKeys
        );
        const ret = await executeCall([tx], chainId, nonce, [], proxyTestModuleCall, undefined, txParams);
        expect(ret.status).to.equal(1);
        const lockInfo = await proxyTestModuleCall.getLockInfo();
        expect(lockInfo.isLockedRet).to.false;
        expect(await proxyTestModuleCall.getKeysetHash()).to.equal(newKeysetHash);
        expect(await proxyTestModuleCall.getNonce()).to.equals(nonce);
        expect(await proxyTestModuleCall.getMetaNonce()).to.equals(metaNonce);
        metaNonce++;
        nonce++;
      });
      it(`Update KeysetHash By Guardian With TimeOut For ${module}`, async function () {
        await init();
        const newKeysetHash = Wallet.createRandom().privateKey;
        const selectedKeys = selectKeys(keys, Role.Guardian, GUARDIAN_TIMELOCK_THRESHOLD);
        const tx = await generateUpdateKeysetHashTx(
          chainId,
          proxyTestModuleCall,
          metaNonce,
          newKeysetHash,
          true,
          Role.Guardian,
          selectedKeys
        );
        const ret = await executeCall([tx], chainId, nonce, [], proxyTestModuleCall, undefined, txParams);
        expect(ret.status).to.equal(1);
        const lockInfo = await proxyTestModuleCall.getLockInfo();
        expect(lockInfo.isLockedRet).to.true;
        expect(lockInfo.lockedKeysetHashRet).to.equal(newKeysetHash);
        expect(await proxyTestModuleCall.getNonce()).to.equals(nonce);
        expect(await proxyTestModuleCall.getMetaNonce()).to.equals(metaNonce);
        metaNonce++;
        nonce++;
      });

      it(`UnLock KeysetHash TimeLock For ${module}`, async function () {
        await init();
        // Update Delay To 3
        const newDelay = 3;
        const selectedKeys = selectKeys(keys, Role.Owner, OWNER_THRESHOLD);
        let tx = await generateUpdateTimeLockDuringTx(chainId, proxyTestModuleCall, metaNonce, newDelay, selectedKeys);
        let ret = await executeCall([tx], chainId, nonce, [], proxyTestModuleCall, undefined, txParams);
        expect(ret.status).to.equal(1);
        let lockInfo = await proxyTestModuleCall.getLockInfo();
        expect(lockInfo.isLockedRet).to.false;
        expect(lockInfo.lockDuringRet).to.equal(newDelay);
        expect(await proxyTestModuleCall.getNonce()).to.equals(nonce);
        expect(await proxyTestModuleCall.getMetaNonce()).to.equals(metaNonce);
        nonce++;
        metaNonce++;

        const newKeysetHash = hexlify(randomBytes(32));
        tx = await generateUpdateKeysetHashTx(
          chainId,
          proxyTestModuleCall,
          metaNonce,
          newKeysetHash,
          true,
          Role.Guardian,
          selectKeys(keys, Role.Guardian, GUARDIAN_TIMELOCK_THRESHOLD)
        );
        ret = await executeCall([tx], chainId, nonce, [], proxyTestModuleCall, undefined, txParams);
        expect(ret.status).to.equal(1);
        lockInfo = await proxyTestModuleCall.getLockInfo();
        expect(lockInfo.isLockedRet).to.true;
        expect(lockInfo.lockedKeysetHashRet).to.equal(newKeysetHash);
        expect(await proxyTestModuleCall.getKeysetHash()).not.to.equal(newKeysetHash);
        expect(await proxyTestModuleCall.getNonce()).to.equals(nonce);
        expect(await proxyTestModuleCall.getMetaNonce()).to.equals(metaNonce);
        nonce++;
        metaNonce++;

        await new Promise((resolve) => setTimeout(resolve, newDelay * 1000 + 1000));
        tx = await generateUnlockKeysetHashTx(proxyTestModuleCall, metaNonce);
        ret = await executeCall([tx], chainId, nonce, [], proxyTestModuleCall, undefined, txParams);
        expect(ret.status).to.equal(1);
        expect(await proxyTestModuleCall.getKeysetHash()).to.equals(newKeysetHash);
        expect(await proxyTestModuleCall.getNonce()).to.equals(nonce);
        expect(await proxyTestModuleCall.getMetaNonce()).to.equals(metaNonce);
        nonce++;
        metaNonce++;
      });

      it(`Cancel KeysetHash TimeLock For ${module}`, async function () {
        await init();
        const newKeysetHash = hexlify(randomBytes(32));
        let tx = await generateUpdateKeysetHashTx(
          chainId,
          proxyTestModuleCall,
          metaNonce,
          newKeysetHash,
          true,
          Role.Guardian,
          selectKeys(keys, Role.Guardian, GUARDIAN_TIMELOCK_THRESHOLD)
        );
        let ret = await executeCall([tx], chainId, nonce, [], proxyTestModuleCall, undefined, txParams);
        let lockInfo = await proxyTestModuleCall.getLockInfo();
        expect(lockInfo.isLockedRet).to.true;
        expect(lockInfo.lockedKeysetHashRet).to.equal(newKeysetHash);
        expect(await proxyTestModuleCall.getKeysetHash()).not.to.equal(newKeysetHash);
        expect(await proxyTestModuleCall.getNonce()).to.equals(nonce);
        expect(await proxyTestModuleCall.getMetaNonce()).to.equals(metaNonce);
        nonce++;
        metaNonce++;

        tx = await generateCancelLockKeysetHashTx(
          chainId,
          proxyTestModuleCall,
          metaNonce,
          selectKeys(keys, Role.Owner, OWNER_CANCEL_TIMELOCK_THRESHOLD)
        );
        ret = await executeCall([tx], chainId, nonce, [], proxyTestModuleCall, undefined, txParams);
        expect(ret.status).to.equal(1);
        lockInfo = await proxyTestModuleCall.getLockInfo();
        expect(lockInfo.isLockedRet).to.false;
        expect(await proxyTestModuleCall.getMetaNonce()).to.equals(metaNonce);
        expect(await proxyTestModuleCall.getNonce()).to.equals(nonce);
        expect(await proxyTestModuleCall.getMetaNonce()).to.equals(metaNonce);
        nonce++;
        metaNonce++;
      });
      it(`Update TimeLock LockDuring For ${module}`, async function () {
        await init();
        const newDelay = 2;
        const selectedKeys = selectKeys(keys, Role.Owner, OWNER_THRESHOLD);

        let tx = await generateUpdateTimeLockDuringTx(chainId, proxyTestModuleCall, metaNonce, newDelay, selectedKeys);
        let ret = await executeCall([tx], chainId, nonce, [], proxyTestModuleCall, undefined, txParams);
        expect(ret.status).to.equal(1);
        const lockInfo = await proxyTestModuleCall.getLockInfo();
        expect(lockInfo.isLockedRet).to.false;
        expect(lockInfo.lockDuringRet).to.equal(newDelay);
        expect(await proxyTestModuleCall.getNonce()).to.equals(nonce);
        expect(await proxyTestModuleCall.getMetaNonce()).to.equals(metaNonce);
        nonce++;
        metaNonce++;
      });
      it(`Update Implementation For ${module}`, async function () {
        await init();
        const selectedKeys = selectKeys(keys, Role.Owner, OWNER_THRESHOLD);

        let tx = await generateUpdateImplementationTx(chainId, proxyTestModuleCall, metaNonce, greeter1.address, selectedKeys);
        let ret = await executeCall([tx], chainId, nonce, [], proxyTestModuleCall, undefined, txParams);
        expect(ret.status).to.equal(1);
        proxyTestModuleCall = Greeter.attach(proxyTestModuleCall.address);
        expect(await proxyTestModuleCall.ret1()).to.equals(1);
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
      ERC721TokenId1 = await testERC721.tokenOfOwnerByIndex(testERC721Owner1.address, 0);
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
      await testERC1155.mint(testERC1155Owner1.address, ERC1155TokenId1, 100, "0x");
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
    it("Test ERC721 Transfer", async function () {
      const ret = await (
        await testERC721
          .connect(testERC721Owner1)
          .transferFrom(testERC721Owner1.address, proxyTestModuleCall.address, ERC721TokenId1)
      ).wait();
      expect(ret.status).to.equal(1);
      expect(await testERC721.ownerOf(ERC721TokenId1)).to.equal(proxyTestModuleCall.address);
    });

    it("Test ERC1155 Transfer", async function () {
      const value = 10;
      const ret = await (
        await testERC1155
          .connect(testERC1155Owner1)
          .safeTransferFrom(testERC1155Owner1.address, proxyTestModuleCall.address, ERC1155TokenId1, value, "0x")
      ).wait();
      expect(ret.status).to.equal(1);
      expect(await testERC1155.balanceOf(proxyTestModuleCall.address, ERC1155TokenId1)).equal(value);
    });

    it("Test ERC20 Transfer", async function () {
      const value = 10;
      const ret = await (await testERC20.connect(testERC20Owner1).transfer(proxyTestModuleCall.address, value)).wait();
      expect(ret.status).to.equal(1);
      expect(await testERC20.balanceOf(proxyTestModuleCall.address)).equal(value);
    });

    it("Test ETH Transfer", async function () {
      const oldValue = await proxyTestModuleCall.provider.getBalance(proxyTestModuleCall.address);
      const value = 10;
      const ret = await transferEth(proxyTestModuleCall.address, value);
      expect(ret.status).to.equal(1);
      expect(await proxyTestModuleCall.provider.getBalance(proxyTestModuleCall.address)).equal(
        ethers.utils.parseEther(value.toString()).add(oldValue)
      );
    });
    it("Test Greeter Hook", async function () {
      const selector = greeter2.interface.getSighash("ret1");
      const selectedKeys = selectKeys(keys, Role.Owner, OWNER_THRESHOLD);
      let tx = generateAddHookTx(proxyTestModuleCall, selector, greeter2.address);
      let ret = await executeCall([tx], chainId, nonce, selectedKeys, proxyTestModuleCall, undefined, txParams);
      expect(ret.status).to.equal(1);
      ret = await proxyTestModuleCall.readHook(selector);
      expect(ret).to.equal(greeter2.address);
      let data = greeter2.interface.encodeFunctionData("ret1");
      ret = await (await ethers.getSigners())[0].call({ to: proxyTestModuleCall.address, data });
      expect(ret).equal(solidityPack(["uint256"], [1]));
      expect(await proxyTestModuleCall.getNonce()).to.equals(nonce);
      nonce++;

      tx = generateRemoveHookTx(proxyTestModuleCall, selector);
      ret = await executeCall([tx], chainId, nonce, selectedKeys, proxyTestModuleCall, undefined, txParams);
      expect(ret.status).to.equal(1);
      ret = await proxyTestModuleCall.readHook(selector);
      expect(ret).to.equal(ethers.constants.AddressZero);
      expect(await proxyTestModuleCall.getNonce()).to.equals(nonce);
      nonce++;

      tx = generateAddHookTx(proxyTestModuleCall, selector, greeter1.address);
      ret = executeCall([tx], chainId, nonce, selectedKeys, proxyTestModuleCall, undefined, txParams);
      const txHash = await generateTransactionHash(chainId, proxyTestModuleCall.address, await parseTxs([tx]), nonce);
      await expect(ret).to.revertedWith(
        `VM Exception while processing transaction: reverted with custom error 'TxFailed("${txHash}", 0, "0x08c379a00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000001c5f7265717569726557686974654c6973743a204e4f545f574849544500000000")'`
      );
    });
  });

  describe("Test EIP4337 Wallet Hook", () => {
    let EIP4337Wallet: ContractFactory;
    let eip4337Wallet: Contract;
    let entryPoint: Wallet;
    let eip4337WalletNonce: number;
    this.beforeAll(async () => {
      entryPoint = Wallet.createRandom();
      await transferEth(entryPoint.address, 10);

      EIP4337Wallet = await ethers.getContractFactory("ModuleHookEIP4337Wallet");
      eip4337Wallet = await EIP4337Wallet.deploy(entryPoint.address);
      entryPoint = entryPoint.connect(eip4337Wallet.provider);
      const ret = await (await moduleWhiteList.updateHookWhiteList(eip4337Wallet.address, true)).wait();
      expect(ret.status).to.equals(1);
    });
    this.beforeEach(async () => {
      const tx1 = generateAddHookTx(
        proxyTestModuleCall,
        EIP4337Wallet.interface.getSighash("updateEntryPoint"),
        eip4337Wallet.address
      );
      const tx2 = generateAddHookTx(
        proxyTestModuleCall,
        EIP4337Wallet.interface.getSighash("getEntryPoint"),
        eip4337Wallet.address
      );
      const tx3 = generateAddHookTx(
        proxyTestModuleCall,
        EIP4337Wallet.interface.getSighash("getEIP4337WalletNonce"),
        eip4337Wallet.address
      );
      const tx4 = generateAddHookTx(
        proxyTestModuleCall,
        EIP4337Wallet.interface.getSighash("validateUserOp"),
        eip4337Wallet.address
      );
      const tx5 = generateAddHookTx(
        proxyTestModuleCall,
        EIP4337Wallet.interface.getSighash("execFromEntryPoint"),
        eip4337Wallet.address
      );
      const tx6 = generateAddPermissionTx(proxyTestModuleCall, EIP4337Wallet.interface.getSighash("updateEntryPoint"), {
        ownerWeight: 100,
        assetsOpWeight: 0,
        guardianWeight: 0,
      });
      const tx7 = generateAddPermissionTx(proxyTestModuleCall, EIP4337Wallet.interface.getSighash("validateUserOp"), {
        ownerWeight: 100,
        assetsOpWeight: 0,
        guardianWeight: 0,
      });
      const tx8 = generateAddPermissionTx(proxyTestModuleCall, EIP4337Wallet.interface.getSighash("execFromEntryPoint"), {
        ownerWeight: 100,
        assetsOpWeight: 0,
        guardianWeight: 0,
      });
      const selectedKeys = selectKeys(keys, Role.Owner, OWNER_THRESHOLD);
      const ret = await executeCall(
        [tx1, tx2, tx3, tx4, tx5, tx6, tx7, tx8],
        chainId,
        nonce,
        selectedKeys,
        proxyTestModuleCall,
        undefined,
        txParams
      );
      expect(ret.status).to.equals(1);
      eip4337WalletNonce = 1;
      nonce++;
    });
    it("Test Update Entry Point", async () => {
      proxyTestModuleCall = eip4337Wallet.attach(proxyTestModuleCall.address);
      const newEntryPoint = await (await ethers.getContractFactory("Greeter")).deploy();
      const tx = generateUpdateEntryPointTx(proxyTestModuleCall, eip4337WalletNonce, newEntryPoint.address);
      proxyTestModuleCall = testModuleCall.attach(proxyTestModuleCall.address);
      const selectedKeys = selectKeys(keys, Role.Owner, OWNER_THRESHOLD);
      const ret = await executeCall([tx], chainId, nonce, selectedKeys, proxyTestModuleCall, undefined, txParams);
      proxyTestModuleCall = eip4337Wallet.attach(proxyTestModuleCall.address);
      expect(ret.status).to.equals(1);
      expect(await proxyTestModuleCall.getEntryPoint()).to.equals(newEntryPoint.address);
      expect(await proxyTestModuleCall.getEIP4337WalletNonce()).to.equals(eip4337WalletNonce);
      eip4337WalletNonce++;
    });
    it("Test Validate User Op", async () => {
      const newKeysetHash = hexlify(randomBytes(32));
      const requestId = hexlify(randomBytes(32));
      const selectedKeys = selectKeys(keys, Role.Owner, OWNER_THRESHOLD);
      const tx = await generateUpdateKeysetHashTx(
        chainId,
        proxyTestModuleCall,
        metaNonce,
        newKeysetHash,
        false,
        Role.Owner,
        selectedKeys
      );
      let op = DefaultsForUserOp;
      op.sender = proxyTestModuleCall.address;
      op.nonce = eip4337WalletNonce;
      op.callData = EIP4337Wallet.interface.encodeFunctionData("execFromEntryPoint", [tx]);
      op.signature = "0x";
      proxyTestModuleCall = eip4337Wallet.attach(proxyTestModuleCall.address);
      let ret = await (await proxyTestModuleCall.connect(entryPoint).validateUserOp(op, requestId, 0)).wait();
      expect(ret.status).to.equals(1);

      expect(await proxyTestModuleCall.getEIP4337WalletNonce()).to.equals(eip4337WalletNonce);
      eip4337WalletNonce++;

      ret = await (await proxyTestModuleCall.connect(entryPoint).execFromEntryPoint(tx)).wait();
      expect(ret.status).to.equals(1);
      proxyTestModuleCall = testModuleCall.attach(proxyTestModuleCall.address);
      expect(await proxyTestModuleCall.getKeysetHash()).to.equals(newKeysetHash);
    });
  });

  it("Test Multiple Transactions", async function () {
    const to = Wallet.createRandom();
    const value = ethers.utils.parseEther("10");
    const newKeysetHash = `0x${Buffer.from(randomBytes(32)).toString("hex")}`;
    const selectedKeys = selectKeys(keys, Role.Owner, OWNER_THRESHOLD);
    const tx1 = await generateUpdateKeysetHashTx(
      chainId,
      proxyTestModuleCall,
      metaNonce,
      newKeysetHash,
      false,
      Role.Owner,
      selectedKeys
    );
    const tx2 = await generateTransferTx(to.address, ethers.constants.Zero, value);
    const sessionKey = Wallet.createRandom();

    const ret = await executeCall(
      [tx1, tx2],
      chainId,
      nonce,
      selectKeys(keys, Role.AssetsOp, ASSETS_OP_THRESHOLD),
      proxyTestModuleCall,
      {
        key: sessionKey,
        timestamp: Math.ceil(Date.now() / 1000) + 500,
        weight: 100,
      },
      txParams
    );

    expect(ret.status).to.equal(1);
    expect(await proxyTestModuleCall.provider.getBalance(to.address)).equal(value);
    expect(await proxyTestModuleCall.getKeysetHash()).to.equal(newKeysetHash);
  });

  it("Test Self Execute Transactions", async function () {
    const to = Wallet.createRandom();
    const value = ethers.utils.parseEther("10");
    const newKeysetHash = `0x${Buffer.from(randomBytes(32)).toString("hex")}`;
    const selectedKeys = selectKeys(keys, Role.Owner, OWNER_THRESHOLD);
    const tx1 = await generateUpdateKeysetHashTx(
      chainId,
      proxyTestModuleCall,
      metaNonce,
      newKeysetHash,
      false,
      Role.Owner,
      selectedKeys
    );
    const tx2 = await generateTransferTx(to.address, ethers.constants.Zero, value);
    const tx: Transaction = {
      revertOnError: true,
      gasLimit: constants.Zero,
      target: proxyTestModuleCall.address,
      callType: CallType.Call,
      value: constants.Zero,
      data: { transactions: [tx1, tx2], roleWeightThreshold: { ownerWeight: 0, assetsOpWeight: 100, guardianWeight: 0 } },
    };
    const sessionKey = Wallet.createRandom();

    const ret = await executeCall(
      [tx],
      chainId,
      nonce,
      selectKeys(keys, Role.AssetsOp, ASSETS_OP_THRESHOLD),
      proxyTestModuleCall,
      {
        key: sessionKey,
        timestamp: Math.ceil(Date.now() / 1000) + 500,
        weight: 100,
      },
      txParams
    );

    expect(ret.status).to.equal(1);
    expect(await proxyTestModuleCall.provider.getBalance(to.address)).equal(value);
    expect(await proxyTestModuleCall.getKeysetHash()).to.equal(newKeysetHash);
  });
  describe("Test EIP1271", () => {
    let sessionKey: Wallet;
    let expired: number;
    let digestHash: string;
    this.beforeEach(async () => {
      sessionKey = Wallet.createRandom();
      expired = Math.ceil(Date.now() / 1000 + 300);
      digestHash = ethers.utils.hexlify(randomBytes(32));
    });
    it("Is Valid Signature Should Not Success For Owner Signature", async () => {
      const selectedKeys = selectKeys(keys, Role.Owner, OWNER_THRESHOLD);
      const signature = await generateSignature(digestHash, proxyTestModuleCall.address, selectedKeys, undefined);
      expect(await proxyTestModuleCall.isValidSignature(digestHash, signature)).to.not.equals(SELECTOR_ERC1271_BYTES32_BYTES);
    });

    it("Is Valid Signature Should Success For AssetsOp Signature", async () => {
      const selectedKeys = selectKeys(keys, Role.AssetsOp, ASSETS_OP_THRESHOLD);
      const signature = await generateSignature(digestHash, proxyTestModuleCall.address, selectedKeys, undefined);
      expect(await proxyTestModuleCall.isValidSignature(digestHash, signature)).to.equals(SELECTOR_ERC1271_BYTES32_BYTES);
    });

    it("Is Valid Signature Should Not Success For Gurdian Signature", async () => {
      const selectedKeys = selectKeys(keys, Role.Guardian, GUARDIAN_THRESHOLD);
      const signature = await generateSignature(digestHash, proxyTestModuleCall.address, selectedKeys, undefined);
      expect(await proxyTestModuleCall.isValidSignature(digestHash, signature)).to.not.equals(SELECTOR_ERC1271_BYTES32_BYTES);
    });

    it("Is Valid Signature Should Success For SessionKey Signature", async () => {
      const selectedKeys = selectKeys(keys, Role.AssetsOp, ASSETS_OP_THRESHOLD);
      const signature = await generateSignature(digestHash, proxyTestModuleCall.address, selectedKeys, {
        timestamp: Math.ceil(Date.now() / 1000) + 5000,
        weight: 100,
        key: Wallet.createRandom(),
      });
      expect(await proxyTestModuleCall.isValidSignature(digestHash, signature)).to.equals(SELECTOR_ERC1271_BYTES32_BYTES);
    });
  });
});
