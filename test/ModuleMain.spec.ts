import { expect } from "chai";
import {
  BigNumber,
  Contract,
  ContractFactory,
  Overrides,
  Wallet,
} from "ethers";
import { randomBytes } from "ethers/lib/utils";
import { ethers } from "hardhat";
import {
  generateRecoveryEmails,
  getKeysetHash,
  optimalGasLimit,
} from "./utils/common";
import { Deployer } from "./utils/deployer";
import {
  ActionType,
  CallType,
  generateAccountLayerSignature,
  generateSessionKey,
  generateTransactionSig,
  SigType,
} from "./utils/sigPart";

describe("ModuleMain", function () {
  let moduleMain: Contract;
  let ModuleMain: ContractFactory;
  let proxyModuleMain: Contract;
  let deployer: Deployer;
  let dkimKeys: Contract;
  let masterKey: Wallet;
  let keysetHash: string;
  let threshold: number;
  let recoveryEmails: string[];
  let dkimKeysAdmin: Wallet;
  let testErc20Token: Contract;
  let testERC721: Contract;
  let testERC1155: Contract;
  let value: number;
  let ERC721TokenId: string;
  let ERC1155TokenId: string;
  let txParams: Overrides;
  this.beforeAll(async function () {
    const [signer] = await ethers.getSigners();
    deployer = await new Deployer(signer).init();
    txParams = {
      gasLimit: 6000000,
      gasPrice: (await signer.provider?.getGasPrice())?.mul(12).div(10),
    };

    const DkimKeys = await ethers.getContractFactory("DkimKeys");
    dkimKeysAdmin = Wallet.createRandom();
    dkimKeys = await deployer.deployContract(
      DkimKeys,
      0,
      txParams,
      dkimKeysAdmin.address
    );

    const ModuleMainUpgradable = await ethers.getContractFactory(
      "ModuleMainUpgradable"
    );
    const moduleMainUpgradable = await deployer.deployContract(
      ModuleMainUpgradable,
      0,
      txParams,
      dkimKeys.address
    );
    ModuleMain = await ethers.getContractFactory("ModuleMain");
    moduleMain = await deployer.deployContract(
      ModuleMain,
      0,
      txParams,
      deployer.singleFactoryContract.address,
      moduleMainUpgradable.address,
      dkimKeys.address
    );

    const TestErc20Token = await ethers.getContractFactory("TestERC20");
    testErc20Token = await TestErc20Token.deploy();

    const TestERC721 = await ethers.getContractFactory("TestERC721");
    testERC721 = await TestERC721.deploy();

    const TestERC1155 = await ethers.getContractFactory("TestERC1155");
    testERC1155 = await TestERC1155.deploy();
  });

  this.beforeEach(async function () {
    threshold = 4;
    masterKey = Wallet.createRandom();

    recoveryEmails = generateRecoveryEmails(10);
    keysetHash = getKeysetHash(masterKey.address, threshold, recoveryEmails);

    proxyModuleMain = await deployer.deployProxyContract(
      moduleMain.interface,
      moduleMain.address,
      keysetHash,
      txParams
    );
    const txRet = await (
      await ethers.getSigners()
    )[0].sendTransaction({
      to: proxyModuleMain.address,
      value: ethers.utils.parseEther("100"),
    });
    expect((await txRet.wait()).status).to.equal(1);

    value = 100;
    let ret = await (
      await testErc20Token.mint(proxyModuleMain.address, value)
    ).wait();
    expect(ret.status).to.equal(1);
    expect(await testErc20Token.balanceOf(proxyModuleMain.address)).to.equal(
      value
    );

    ret = await (await testERC721.safeMint(proxyModuleMain.address)).wait();
    expect(ret.status).to.equal(1);
    expect(await testERC721.balanceOf(proxyModuleMain.address)).to.equal(1);
    ERC721TokenId = await testERC721.tokenOfOwnerByIndex(
      proxyModuleMain.address,
      0
    );

    ERC1155TokenId = `0x${Buffer.from(randomBytes(32)).toString("hex")}`;
    ret = await (
      await testERC1155.mint(
        proxyModuleMain.address,
        ERC1155TokenId,
        value,
        "0x"
      )
    ).wait();
    expect(ret.status).to.equal(1);
    expect(
      await testERC1155.balanceOf(proxyModuleMain.address, ERC1155TokenId)
    ).to.equal(value);
  });

  describe("Test User Register", async () => {
    let masterKey: Wallet;
    let recoveryEmails: string[];
    let threshold: number;
    let userAddress: string;
    let keysetHash: string;
    it("User Not Registered", async () => {
      masterKey = Wallet.createRandom();
      threshold = 5;

      recoveryEmails = generateRecoveryEmails(10);
      keysetHash = getKeysetHash(masterKey.address, threshold, recoveryEmails);

      userAddress = deployer.getProxyContractAddress(
        moduleMain.address,
        keysetHash
      );

      const code = await moduleMain.provider.getCode(userAddress);
      expect(code).to.equal("0x");
    });

    it("User Registered", async () => {
      await deployer.deployProxyContract(
        moduleMain.interface,
        moduleMain.address,
        keysetHash,
        txParams
      );
      const code = await moduleMain.provider.getCode(userAddress);
      expect(code).to.not.equal("0x");
    });
  });

  it("Test Validating Permit", async () => {
    const sessionKey = Wallet.createRandom();
    const expired = Math.ceil(Date.now() / 1000 + 300);
    const digestHash = Wallet.createRandom().privateKey;
    const permit = await generateSessionKey(
      masterKey,
      threshold,
      recoveryEmails,
      digestHash,
      sessionKey,
      expired
    );
    const ret = await proxyModuleMain.isValidSignature(
      SigType.SigSessionKey,
      digestHash,
      permit,
      0
    );
    expect(ret).to.be.true;
  });

  it("Test Account Recovery By Emails", async () => {
    const newKeysetHash = `0x${Buffer.from(randomBytes(32)).toString("hex")}`;
    const data = await generateAccountLayerSignature(
      proxyModuleMain.address,
      ActionType.UpdateKeysetHash,
      1,
      undefined,
      newKeysetHash,
      undefined,
      masterKey,
      threshold,
      recoveryEmails,
      SigType.SigRecoveryEmail
    );
    const value = ethers.constants.Zero;
    let tx = {
      callType: CallType.CallAccountLayer,
      gasLimit: ethers.constants.Zero,
      target: ethers.constants.AddressZero,
      value,
      data,
    };
    const nonce = 1;
    const { chainId } = await proxyModuleMain.provider.getNetwork();
    const feeToken = ethers.constants.AddressZero;
    const feeReceiver = ethers.constants.AddressZero;
    const feeAmount = 0;

    const signature = generateTransactionSig(
      chainId,
      [tx],
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
      await proxyModuleMain.execute(
        [tx],
        nonce,
        feeToken,
        feeReceiver,
        0,
        signature
      )
    ).wait();
    expect(ret.status).to.equal(1);
    expect(await proxyModuleMain.lockedKeysetHash()).to.equal(newKeysetHash);
  });

  it("Test Transfer Eth", async () => {
    const nonce = (await proxyModuleMain.getNonce()) + 1;
    const { chainId } = await proxyModuleMain.provider.getNetwork();
    const feeToken = Wallet.createRandom().address;
    const feeReceiver = Wallet.createRandom().address;
    const feeAmount = 0;
    const sessionKey = Wallet.createRandom();
    const expired = Math.ceil(Date.now() / 1000 + 300);

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

    const signature = generateTransactionSig(
      chainId,
      [tx1, tx2],
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

    const recipt = await (
      await proxyModuleMain.execute(
        [tx1, tx2],
        nonce,
        feeToken,
        feeReceiver,
        0,
        signature
      )
    ).wait();
    expect(recipt.status).to.equal(1);
    expect(await proxyModuleMain.provider.getBalance(to1.address)).equal(
      value1
    );
    expect(await proxyModuleMain.provider.getBalance(to2.address)).equal(
      value2
    );
    expect(await proxyModuleMain.getNonce()).to.equal(nonce);
  });

  it("Test Transfer Erc20", async () => {
    const nonce = (await proxyModuleMain.getNonce()) + 1;
    const { chainId } = await proxyModuleMain.provider.getNetwork();
    const feeToken = Wallet.createRandom().address;
    const feeReceiver = Wallet.createRandom().address;
    const feeAmount = 0;
    const sessionKey = Wallet.createRandom();
    const expired = Math.ceil(Date.now() / 1000 + 300);

    const to1 = Wallet.createRandom();
    const to2 = Wallet.createRandom();
    const value1 = 10;
    const value2 = 20;
    const data1 = testErc20Token.interface.encodeFunctionData("transfer", [
      to1.address,
      value1,
    ]);
    const data2 = testErc20Token.interface.encodeFunctionData("transfer", [
      to2.address,
      value2,
    ]);
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

    const signature = generateTransactionSig(
      chainId,
      [tx1, tx2],
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

    const recipt = await (
      await proxyModuleMain.execute(
        [tx1, tx2],
        nonce,
        feeToken,
        feeReceiver,
        0,
        signature
      )
    ).wait();
    expect(recipt.status).to.equal(1);
    expect(await testErc20Token.balanceOf(to1.address)).equal(value1);
    expect(await testErc20Token.balanceOf(to2.address)).equal(value2);
    expect(await proxyModuleMain.getNonce()).to.equal(nonce);
  });

  it("Test Transfer Erc721", async () => {
    const nonce = (await proxyModuleMain.getNonce()) + 1;
    const { chainId } = await proxyModuleMain.provider.getNetwork();
    const feeToken = Wallet.createRandom().address;
    const feeReceiver = Wallet.createRandom().address;
    const feeAmount = 0;
    const sessionKey = Wallet.createRandom();
    const expired = Math.ceil(Date.now() / 1000 + 300);

    const to1 = Wallet.createRandom();
    const data1 = testERC721.interface.encodeFunctionData("transferFrom", [
      proxyModuleMain.address,
      to1.address,
      ERC721TokenId,
    ]);

    const tx1 = {
      callType: CallType.Call,
      gasLimit: ethers.constants.Zero,
      target: testERC721.address,
      value: ethers.constants.Zero,
      data: data1,
    };

    const signature = generateTransactionSig(
      chainId,
      [tx1],
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

    const recipt = await (
      await proxyModuleMain.execute(
        [tx1],
        nonce,
        feeToken,
        feeReceiver,
        0,
        signature
      )
    ).wait();
    expect(recipt.status).to.equal(1);
    expect(await testERC721.ownerOf(ERC721TokenId)).equal(to1.address);
    expect(await proxyModuleMain.getNonce()).to.equal(nonce);
  });

  it("Test Transfer Erc1155", async () => {
    const nonce = (await proxyModuleMain.getNonce()) + 1;
    const { chainId } = await proxyModuleMain.provider.getNetwork();
    const feeToken = Wallet.createRandom().address;
    const feeReceiver = Wallet.createRandom().address;
    const feeAmount = 0;
    const sessionKey = Wallet.createRandom();
    const expired = Math.ceil(Date.now() / 1000 + 300);

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

    const signature = generateTransactionSig(
      chainId,
      [tx1, tx2],
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

    const recipt = await (
      await proxyModuleMain.execute(
        [tx1, tx2],
        nonce,
        feeToken,
        feeReceiver,
        0,
        signature
      )
    ).wait();
    expect(recipt.status).to.equal(1);
    expect(await testERC1155.balanceOf(to1.address, ERC1155TokenId)).equal(
      value1
    );
    expect(await testERC1155.balanceOf(to2.address, ERC1155TokenId)).equal(
      value2
    );
    expect(await proxyModuleMain.getNonce()).to.equal(nonce);
  });
});
