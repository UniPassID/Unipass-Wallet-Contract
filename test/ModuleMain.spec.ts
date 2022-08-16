import { expect } from "chai";
import { BigNumber, Contract, ContractFactory, Overrides, Wallet } from "ethers";
import { keccak256, randomBytes, solidityPack } from "ethers/lib/utils";
import { ethers } from "hardhat";
import * as hre from "hardhat";
import NodeRSA from "node-rsa";
import {
  ASSETS_OP_THRESHOLD,
  getKeysetHash,
  GUARDIAN_TIMELOCK_THRESHOLD,
  optimalGasLimit,
  OWNER_THRESHOLD,
  transferEth,
} from "./utils/common";
import { Deployer } from "./utils/deployer";
import { KeyBase, randomKeys, selectKeys } from "./utils/key";
import {
  CallType,
  executeCall,
  generateSyncAccountTx,
  generateTransactionSig,
  generateTransferTx,
  generateUnlockKeysetHashTx,
  generateUpdateKeysetHashTx,
  generateUpdateTimeLockDuringTx,
  Role,
} from "./utils/sigPart";

describe("ModuleMain", function () {
  let testERC1271Wallet: [Contract, Wallet][] = [];
  let moduleMain: Contract;
  let ModuleMain: ContractFactory;
  let ModuleMainUpgradable: ContractFactory;
  let proxyModuleMain: Contract;
  let deployer: Deployer;
  let dkimKeys: Contract;
  let keysetHash: string;
  let keys: KeyBase[];
  let dkimKeysAdmin: Wallet;
  let testErc20Token: Contract;
  let testERC721: Contract;
  let testERC1155: Contract;
  let value: number;
  let ERC721TokenId: string;
  let ERC1155TokenId: string;
  let txParams: Overrides;
  let chainId: number;
  let unipassPrivateKey: string;
  let privateKey: NodeRSA;
  let nonce: number;
  let metaNonce: number;
  let Greeter: ContractFactory;
  let greeter1: Contract;
  let greeter2: Contract;
  let moduleWhiteListAdmin: Wallet;
  let hooksWhiteList: Contract;
  this.beforeAll(async function () {
    const TestERC1271Wallet = await ethers.getContractFactory("TestERC1271Wallet");
    const [signer] = await ethers.getSigners();
    chainId = (await signer.provider!.getNetwork()).chainId;
    deployer = await new Deployer(signer).init();
    txParams = {
      gasLimit: 10000000,
      gasPrice: (await signer.provider?.getGasPrice())?.mul(12).div(10),
    };

    for (let i = 0; i < 10; i++) {
      const wallet = Wallet.createRandom();
      testERC1271Wallet.push([await deployer.deployContract(TestERC1271Wallet, i, txParams, wallet.address), wallet]);
    }

    Greeter = await ethers.getContractFactory("Greeter");
    greeter1 = await deployer.deployContract(Greeter, 1, txParams);
    greeter2 = await deployer.deployContract(Greeter, 2, txParams);

    moduleWhiteListAdmin = Wallet.createRandom();
    await transferEth(moduleWhiteListAdmin.address, 1);
    const ModuleWhiteList = await ethers.getContractFactory("ModuleWhiteList");
    const moduleWhiteList = await deployer.deployContract(ModuleWhiteList, 0, txParams, moduleWhiteListAdmin.address);
    let ret = await (await moduleWhiteList.updateImplementationWhiteList(greeter1.address, true)).wait();
    expect(ret.status).to.equals(1);
    ret = await (await moduleWhiteList.updateHookWhiteList(greeter2.address, true)).wait();
    expect(ret.status).to.equals(1);

    const DkimKeys = await ethers.getContractFactory("DkimKeys");
    dkimKeysAdmin = Wallet.createRandom().connect(signer.provider!);
    await transferEth(dkimKeysAdmin.address, 1);

    dkimKeys = await deployer.deployContract(DkimKeys, 0, txParams, dkimKeysAdmin.address);

    ModuleMainUpgradable = await ethers.getContractFactory("ModuleMainUpgradable");
    const moduleMainUpgradable = await deployer.deployContract(
      ModuleMainUpgradable,
      0,
      txParams,
      dkimKeys.address,
      moduleWhiteList.address
    );
    ret = await (await moduleWhiteList.updateImplementationWhiteList(moduleMainUpgradable.address, true)).wait();
    expect(ret.status).to.equals(1);
    ModuleMain = await ethers.getContractFactory("ModuleMain");
    moduleMain = await deployer.deployContract(
      ModuleMain,
      0,
      txParams,
      deployer.singleFactoryContract.address,
      moduleMainUpgradable.address,
      dkimKeys.address,
      moduleWhiteList.address
    );

    const TestErc20Token = await ethers.getContractFactory("TestERC20");
    testErc20Token = await TestErc20Token.deploy();

    const TestERC721 = await ethers.getContractFactory("TestERC721");
    testERC721 = await TestERC721.deploy();

    const TestERC1155 = await ethers.getContractFactory("TestERC1155");
    testERC1155 = await TestERC1155.deploy();

    privateKey = new NodeRSA({ b: 2048 });
    unipassPrivateKey = privateKey.exportKey("pkcs1");
    ret = await (
      await dkimKeys
        .connect(dkimKeysAdmin)
        .updateDKIMKey(
          solidityPack(["bytes", "bytes"], [Buffer.from("s2055"), Buffer.from("unipass.com")]),
          privateKey.exportKey("components-public").n.subarray(1)
        )
    ).wait();
    expect(ret.status).to.equals(1);
  });

  this.beforeEach(async function () {
    keys = await randomKeys(10, unipassPrivateKey, testERC1271Wallet);
    keysetHash = getKeysetHash(keys);

    proxyModuleMain = await deployer.deployProxyContract(moduleMain.interface, moduleMain.address, keysetHash, txParams);
    const txRet = await (
      await ethers.getSigners()
    )[0].sendTransaction({
      to: proxyModuleMain.address,
      value: ethers.utils.parseEther("100"),
    });
    expect((await txRet.wait()).status).to.equal(1);

    value = 100;
    let ret = await (await testErc20Token.mint(proxyModuleMain.address, value)).wait();
    expect(ret.status).to.equal(1);
    expect(await testErc20Token.balanceOf(proxyModuleMain.address)).to.equal(value);

    ret = await (await testERC721.safeMint(proxyModuleMain.address)).wait();
    expect(ret.status).to.equal(1);
    expect(await testERC721.balanceOf(proxyModuleMain.address)).to.equal(1);
    ERC721TokenId = await testERC721.tokenOfOwnerByIndex(proxyModuleMain.address, 0);

    ERC1155TokenId = `0x${Buffer.from(randomBytes(32)).toString("hex")}`;
    ret = await (await testERC1155.mint(proxyModuleMain.address, ERC1155TokenId, value, "0x")).wait();
    expect(ret.status).to.equal(1);
    expect(await testERC1155.balanceOf(proxyModuleMain.address, ERC1155TokenId)).to.equal(value);
    metaNonce = 1;
    nonce = 1;
  });

  it("Test Get Signature Weight From Call Data For ModuleMain", async () => {
    for (const [func, funcFragment] of Object.entries(moduleMain.interface.functions)) {
      if (funcFragment.stateMutability !== "pure" && funcFragment.stateMutability !== "view") {
        await moduleMain.getRoleOfPermission(keccak256(Buffer.from(func, "utf-8")).slice(0, 10));
      }
    }
  });

  it("Test Get Signature Weight From Call Data For ModuleMainUpgradable", async () => {
    for (const [func, funcFragment] of Object.entries(ModuleMainUpgradable.interface.functions)) {
      if (funcFragment.stateMutability !== "pure" && funcFragment.stateMutability !== "view") {
        await moduleMain.getRoleOfPermission(keccak256(Buffer.from(func, "utf-8")).slice(0, 10));
      }
    }
  });

  describe("Test User Register", async () => {
    let keys: KeyBase[];
    let userAddress: string;
    let keysetHash: string;
    it("User Not Registered", async () => {
      keys = await randomKeys(10, unipassPrivateKey, testERC1271Wallet);
      keysetHash = getKeysetHash(keys);

      userAddress = deployer.getProxyContractAddress(moduleMain.address, keysetHash);

      const code = await moduleMain.provider.getCode(userAddress);
      expect(code).to.equal("0x");
    });

    it("User Registered", async () => {
      await deployer.deployProxyContract(moduleMain.interface, moduleMain.address, keysetHash, txParams);
      const code = await moduleMain.provider.getCode(userAddress);
      expect(code).to.not.equal("0x");
    });
  });

  it("Test Account Recovery", async () => {
    const newKeysetHash = `0x${Buffer.from(randomBytes(32)).toString("hex")}`;
    const selectedKeys = selectKeys(keys, Role.Guardian, GUARDIAN_TIMELOCK_THRESHOLD);
    const tx = await generateUpdateKeysetHashTx(proxyModuleMain, metaNonce, newKeysetHash, true, selectedKeys);

    const ret = await executeCall([tx], chainId, nonce, [], proxyModuleMain, undefined, txParams);
    expect(ret.status).to.equal(1);
    expect(await proxyModuleMain.lockedKeysetHash()).to.equal(newKeysetHash);
    metaNonce++;
    nonce++;
  });

  it("Test Transfer Eth", async () => {
    const { chainId } = await proxyModuleMain.provider.getNetwork();
    const feeToken = Wallet.createRandom().address;
    const feeReceiver = Wallet.createRandom().address;
    const feeAmount = 0;
    const sessionKey = Wallet.createRandom();
    const timestamp = Math.ceil(Date.now() / 1000 + 5000);
    const selectedKeys = selectKeys(keys, Role.AssetsOp, ASSETS_OP_THRESHOLD);

    const to1 = Wallet.createRandom();
    const to2 = Wallet.createRandom();
    const value1 = BigNumber.from(10);
    const value2 = BigNumber.from(20);
    const tx1 = {
      callType: CallType.Call,
      gasLimit: optimalGasLimit,
      target: to1.address,
      value: value1,
      data: "0x",
    };
    const tx2 = {
      callType: CallType.Call,
      gasLimit: optimalGasLimit,
      target: to2.address,
      value: value2,
      data: "0x",
    };

    const signature = generateTransactionSig(chainId, [tx1, tx2], nonce, feeToken, feeAmount, selectedKeys, {
      key: sessionKey,
      timestamp,
      weight: 100,
    });

    const recipt = await (await proxyModuleMain.execute([tx1, tx2], nonce, feeToken, feeReceiver, 0, signature)).wait();
    expect(recipt.status).to.equal(1);
    expect(await proxyModuleMain.provider.getBalance(to1.address)).equal(value1);
    expect(await proxyModuleMain.provider.getBalance(to2.address)).equal(value2);
    expect(await proxyModuleMain.getNonce()).to.equal(nonce);
    nonce++;
  });

  it("Test Transfer Erc20", async () => {
    const { chainId } = await proxyModuleMain.provider.getNetwork();
    const feeToken = Wallet.createRandom().address;
    const feeReceiver = Wallet.createRandom().address;
    const feeAmount = 0;
    const sessionKey = Wallet.createRandom();
    const timestamp = Math.ceil(Date.now() / 1000 + 5000);
    const selectedKeys = selectKeys(keys, Role.AssetsOp, ASSETS_OP_THRESHOLD);

    const to1 = Wallet.createRandom();
    const to2 = Wallet.createRandom();
    const value1 = 10;
    const value2 = 20;
    const data1 = testErc20Token.interface.encodeFunctionData("transfer", [to1.address, value1]);
    const data2 = testErc20Token.interface.encodeFunctionData("transfer", [to2.address, value2]);
    const tx1 = {
      callType: CallType.Call,
      gasLimit: ethers.constants.Zero,
      target: testErc20Token.address,
      value: ethers.constants.Zero,
      data: data1,
    };
    const tx2 = {
      callType: CallType.Call,
      gasLimit: ethers.constants.Zero,
      target: testErc20Token.address,
      value: ethers.constants.Zero,
      data: data2,
    };

    const signature = generateTransactionSig(chainId, [tx1, tx2], nonce, feeToken, feeAmount, selectedKeys, {
      key: sessionKey,
      timestamp,
      weight: 100,
    });

    const recipt = await (await proxyModuleMain.execute([tx1, tx2], nonce, feeToken, feeReceiver, 0, signature)).wait();
    expect(recipt.status).to.equal(1);
    expect(await testErc20Token.balanceOf(to1.address)).equal(value1);
    expect(await testErc20Token.balanceOf(to2.address)).equal(value2);
    expect(await proxyModuleMain.getNonce()).to.equal(nonce);
    nonce++;
  });

  it("Test Transfer Erc721", async () => {
    const { chainId } = await proxyModuleMain.provider.getNetwork();
    const feeToken = Wallet.createRandom().address;
    const feeReceiver = Wallet.createRandom().address;
    const feeAmount = 0;
    const sessionKey = Wallet.createRandom();
    const timestamp = Math.ceil(Date.now() / 1000 + 5000);
    const selectedKeys = selectKeys(keys, Role.AssetsOp, ASSETS_OP_THRESHOLD);

    const to1 = Wallet.createRandom();
    const data1 = testERC721.interface.encodeFunctionData("transferFrom", [proxyModuleMain.address, to1.address, ERC721TokenId]);

    const tx1 = {
      callType: CallType.Call,
      gasLimit: ethers.constants.Zero,
      target: testERC721.address,
      value: ethers.constants.Zero,
      data: data1,
    };

    const signature = generateTransactionSig(chainId, [tx1], nonce, feeToken, feeAmount, selectedKeys, {
      key: sessionKey,
      timestamp,
      weight: 100,
    });

    const recipt = await (await proxyModuleMain.execute([tx1], nonce, feeToken, feeReceiver, 0, signature)).wait();
    expect(recipt.status).to.equal(1);
    expect(await testERC721.ownerOf(ERC721TokenId)).equal(to1.address);
    expect(await proxyModuleMain.getNonce()).to.equal(nonce);
    nonce++;
  });

  it("Test Transfer Erc1155", async () => {
    const { chainId } = await proxyModuleMain.provider.getNetwork();
    const feeToken = Wallet.createRandom().address;
    const feeReceiver = Wallet.createRandom().address;
    const feeAmount = 0;
    const sessionKey = Wallet.createRandom();
    const timestamp = Math.ceil(Date.now() / 1000 + 5000);
    const selectedKeys = selectKeys(keys, Role.AssetsOp, ASSETS_OP_THRESHOLD);

    const to1 = Wallet.createRandom();
    const to2 = Wallet.createRandom();
    const value1 = 10;
    const value2 = 20;
    const data1 = testERC1155.interface.encodeFunctionData("safeTransferFrom", [
      proxyModuleMain.address,
      to1.address,
      ERC1155TokenId,
      value1,
      "0x",
    ]);
    const data2 = testERC1155.interface.encodeFunctionData("safeTransferFrom", [
      proxyModuleMain.address,
      to2.address,
      ERC1155TokenId,
      value2,
      "0x",
    ]);
    const tx1 = {
      callType: CallType.Call,
      gasLimit: ethers.constants.Zero,
      target: testERC1155.address,
      value: ethers.constants.Zero,
      data: data1,
    };
    const tx2 = {
      callType: CallType.Call,
      gasLimit: ethers.constants.Zero,
      target: testERC1155.address,
      value: ethers.constants.Zero,
      data: data2,
    };

    const signature = generateTransactionSig(chainId, [tx1, tx2], nonce, feeToken, feeAmount, selectedKeys, {
      key: sessionKey,
      timestamp,
      weight: 100,
    });

    const recipt = await (await proxyModuleMain.execute([tx1, tx2], nonce, feeToken, feeReceiver, 0, signature)).wait();
    expect(recipt.status).to.equal(1);
    expect(await testERC1155.balanceOf(to1.address, ERC1155TokenId)).equal(value1);
    expect(await testERC1155.balanceOf(to2.address, ERC1155TokenId)).equal(value2);
    expect(await proxyModuleMain.getNonce()).to.equal(nonce);
    nonce++;
  });

  describe("Test Multi Chains Sync", function () {
    let localModuleMain: Contract;
    let localDeployer: Deployer;
    let localDkimKeys: Contract;
    let localModuleGuest: Contract;
    let localGreeter1: Contract;
    this.beforeAll(async () => {
      hre.changeNetwork("local1");
      const [signer] = await ethers.getSigners();
      localDeployer = await new Deployer(signer).init();

      const TestERC1271Wallet = await ethers.getContractFactory("TestERC1271Wallet");
      await Promise.all(
        testERC1271Wallet.map(async ([, wallet], i) => {
          await localDeployer.deployContract(TestERC1271Wallet, i, txParams, wallet.address);
        })
      );

      const DkimKeys = await ethers.getContractFactory("DkimKeys");
      await transferEth(dkimKeysAdmin.address, 1);

      localDkimKeys = await localDeployer.deployContract(DkimKeys, 0, txParams, dkimKeysAdmin.address);
      dkimKeysAdmin = dkimKeysAdmin.connect(signer.provider!);

      const ModuleGuest = await ethers.getContractFactory("ModuleGuest");
      localModuleGuest = await localDeployer.deployContract(ModuleGuest, 0, txParams);

      localGreeter1 = await localDeployer.deployContract(Greeter, 1, txParams);
      const localGreeter2 = await localDeployer.deployContract(Greeter, 2, txParams);

      await transferEth(moduleWhiteListAdmin.address, 1);
      const ModuleWhiteList = await ethers.getContractFactory("ModuleWhiteList");
      const moduleWhiteList = await localDeployer.deployContract(ModuleWhiteList, 0, txParams, moduleWhiteListAdmin.address);
      let ret = await (await moduleWhiteList.updateImplementationWhiteList(localGreeter1.address, true)).wait();
      expect(ret.status).to.equals(1);
      ret = await (await moduleWhiteList.updateHookWhiteList(localGreeter2.address, true)).wait();
      expect(ret.status).to.equals(1);

      const ModuleMainUpgradable = await ethers.getContractFactory("ModuleMainUpgradable");
      const moduleMainUpgradable = await localDeployer.deployContract(
        ModuleMainUpgradable,
        0,
        txParams,
        localDkimKeys.address,
        moduleWhiteList.address
      );
      ret = await (await moduleWhiteList.updateImplementationWhiteList(moduleMainUpgradable.address, true)).wait();
      expect(ret.status).to.equals(1);
      const ModuleMain = await ethers.getContractFactory("ModuleMain");
      localModuleMain = await localDeployer.deployContract(
        ModuleMain,
        0,
        txParams,
        deployer.singleFactoryContract.address,
        moduleMainUpgradable.address,
        localDkimKeys.address,
        moduleWhiteList.address
      );

      ret = await (
        await localDkimKeys
          .connect(dkimKeysAdmin)
          .updateDKIMKey(
            solidityPack(["bytes", "bytes"], [Buffer.from("s2055"), Buffer.from("unipass.com")]),
            privateKey.exportKey("components-public").n.subarray(1)
          )
      ).wait();
      expect(ret.status).to.equals(1);
      hre.changeNetwork("hardhat");
    });
    it("Playback Should Success", async () => {
      const initKeysetHash = keysetHash;
      let selectedKeys = selectKeys(keys, Role.Owner, OWNER_THRESHOLD);
      keys = await randomKeys(10, unipassPrivateKey, testERC1271Wallet);
      keysetHash = getKeysetHash(keys);
      const tx1 = await generateUpdateKeysetHashTx(proxyModuleMain, metaNonce, keysetHash, false, selectedKeys);
      await executeCall([tx1], chainId, nonce, [], proxyModuleMain, undefined, txParams);
      nonce++;
      metaNonce++;
      const timeLockDuring = 3;
      selectedKeys = selectKeys(keys, Role.Owner, OWNER_THRESHOLD);
      const tx2 = await generateUpdateTimeLockDuringTx(proxyModuleMain, metaNonce, timeLockDuring, selectedKeys);
      await executeCall([tx2], chainId, nonce, [], proxyModuleMain, undefined, txParams);
      nonce++;
      metaNonce++;
      selectedKeys = selectKeys(keys, Role.Guardian, GUARDIAN_TIMELOCK_THRESHOLD);
      const tx3 = await generateTransferTx(dkimKeysAdmin.address, ethers.constants.Zero, ethers.utils.parseEther("0.01"));
      selectedKeys = selectKeys(keys, Role.AssetsOp, ASSETS_OP_THRESHOLD);
      await executeCall(
        [tx3],
        chainId,
        nonce,
        selectedKeys,
        proxyModuleMain,
        {
          timestamp: Math.ceil(Date.now() / 1000) + 5000,
          weight: 100,
          key: Wallet.createRandom(),
        },
        txParams
      );
      nonce++;

      const deployTxData = localDeployer.singleFactoryContract.interface.encodeFunctionData("deploy", [
        Deployer.getInitCode(moduleMain.address),
        initKeysetHash,
      ]);
      const deployTx = {
        callType: CallType.Call,
        gasLimit: ethers.constants.Zero,
        target: localDeployer.singleFactoryContract.address,
        value: ethers.constants.Zero,
        data: deployTxData,
      };
      const executeTxData = localModuleMain.interface.encodeFunctionData("execute", [
        [tx1, tx2],
        1,
        ethers.constants.AddressZero,
        ethers.constants.AddressZero,
        0,
        "0x",
      ]);
      const executeTx = {
        callType: CallType.Call,
        gasLimit: ethers.constants.Zero,
        target: proxyModuleMain.address,
        value: ethers.constants.Zero,
        data: executeTxData,
      };

      hre.changeNetwork("local1");
      const ret = await (
        await localModuleGuest.execute(
          [deployTx, executeTx],
          1,
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
          0,
          "0x",
          txParams
        )
      ).wait();
      const [signer] = await ethers.getSigners();
      proxyModuleMain = new Contract(proxyModuleMain.address, ModuleMain.interface, signer);
      expect(ret.status).to.equals(1);
      expect(await proxyModuleMain.getNonce()).to.equals(1);
      expect(await proxyModuleMain.getMetaNonce()).to.equals(metaNonce - 1);
      expect(await proxyModuleMain.getKeysetHash()).to.equals(keysetHash);
      hre.changeNetwork("hardhat");
    });

    it("Sync Account Should Success", async () => {
      const initKeysetHash = keysetHash;
      const initKeys = keys;
      let selectedKeys = selectKeys(keys, Role.Owner, OWNER_THRESHOLD);
      keys = await randomKeys(10, unipassPrivateKey, testERC1271Wallet);
      keysetHash = getKeysetHash(keys);
      const tx1 = await generateUpdateKeysetHashTx(proxyModuleMain, metaNonce, keysetHash, false, selectedKeys);
      await executeCall([tx1], chainId, nonce, [], proxyModuleMain, undefined, txParams);
      nonce++;
      metaNonce++;
      const timeLockDuring = 3;
      selectedKeys = selectKeys(keys, Role.Owner, OWNER_THRESHOLD);
      const tx2 = await generateUpdateTimeLockDuringTx(proxyModuleMain, metaNonce, timeLockDuring, selectedKeys);
      await executeCall([tx2], chainId, nonce, [], proxyModuleMain, undefined, txParams);
      nonce++;
      metaNonce++;
      selectedKeys = selectKeys(keys, Role.Guardian, GUARDIAN_TIMELOCK_THRESHOLD);
      const newKeys = await randomKeys(10, unipassPrivateKey, testERC1271Wallet);
      const newKeysetHash = getKeysetHash(keys);
      const tx3 = await generateUpdateKeysetHashTx(proxyModuleMain, metaNonce, newKeysetHash, true, selectedKeys);
      await executeCall([tx3], chainId, nonce, [], proxyModuleMain, undefined, txParams);
      nonce++;
      metaNonce++;
      const tx4 = await generateTransferTx(dkimKeysAdmin.address, ethers.constants.Zero, ethers.utils.parseEther("0.01"));
      selectedKeys = selectKeys(keys, Role.AssetsOp, ASSETS_OP_THRESHOLD);
      await executeCall(
        [tx4],
        chainId,
        nonce,
        selectedKeys,
        proxyModuleMain,
        {
          timestamp: Math.ceil(Date.now() / 1000) + 5000,
          weight: 100,
          key: Wallet.createRandom(),
        },
        txParams
      );
      nonce++;
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const tx5 = await generateUnlockKeysetHashTx(proxyModuleMain, metaNonce);
      await executeCall([tx5], chainId, nonce, [], proxyModuleMain, undefined, txParams);
      keys = newKeys;
      keysetHash = newKeysetHash;

      const deployTxData = localDeployer.singleFactoryContract.interface.encodeFunctionData("deploy", [
        Deployer.getInitCode(moduleMain.address),
        initKeysetHash,
      ]);
      const deployTx = {
        callType: CallType.Call,
        gasLimit: ethers.constants.Zero,
        target: localDeployer.singleFactoryContract.address,
        value: ethers.constants.Zero,
        data: deployTxData,
      };
      const syncAccountTx = await generateSyncAccountTx(
        proxyModuleMain,
        metaNonce - 1,
        keysetHash,
        timeLockDuring,
        selectKeys(initKeys, Role.Owner, OWNER_THRESHOLD)
      );
      const executeTxData = localModuleMain.interface.encodeFunctionData("execute", [
        [syncAccountTx],
        1,
        ethers.constants.AddressZero,
        ethers.constants.AddressZero,
        0,
        "0x",
      ]);
      const executeTx = {
        callType: CallType.Call,
        gasLimit: ethers.constants.Zero,
        target: proxyModuleMain.address,
        value: ethers.constants.Zero,
        data: executeTxData,
      };

      hre.changeNetwork("local1");
      const ret = await (
        await localModuleGuest.execute(
          [deployTx, executeTx],
          1,
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
          0,
          "0x"
        )
      ).wait();
      const [signer] = await ethers.getSigners();
      proxyModuleMain = new Contract(proxyModuleMain.address, ModuleMain.interface, signer);
      expect(ret.status).to.equals(1);
      expect(await proxyModuleMain.getNonce()).to.equals(1);
      expect(await proxyModuleMain.getMetaNonce()).to.equals(metaNonce - 1);
      expect(await proxyModuleMain.getKeysetHash()).to.equals(keysetHash);
      expect(await proxyModuleMain.getLockDuring()).to.equals(timeLockDuring);
      hre.changeNetwork("hardhat");
    });
  });
});
