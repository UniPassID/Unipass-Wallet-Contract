import * as dotenv from "dotenv";

import { HardhatUserConfig, task } from "hardhat/config";
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "solidity-coverage";
import "@openzeppelin/hardhat-upgrades";
import "hardhat-contract-sizer";
import "hardhat-change-network";
import "hardhat-dependency-compiler";

dotenv.config();

// This is a sample Hardhat task. To learn ho7w to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.15",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    local1: { url: "http://127.0.0.1:10086" },
    ropsten: {
      url: process.env.ROPSTEN_URL || "",
      accounts: process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    polygon_testnet: {
      url: process.env.POLYGON_TESTNET_URL || "",
      accounts: process.env.POLYGON_TESTNET_PRIVATE_KEY !== undefined ? [process.env.POLYGON_TESTNET_PRIVATE_KEY] : [],
    },
    bsc_testnet: {
      url: process.env.BSC_TESTNET_URL || "",
      accounts: process.env.BSC_TESTNET_PRIVATE_KEY !== undefined ? [process.env.BSC_TESTNET_PRIVATE_KEY] : [],
    },
    rangers_testnet: {
      url: process.env.RANGERS_TESTNET_URL || "",
      accounts: process.env.RANGERS_TESTNET_PRIVATE_KEY !== undefined ? [process.env.RANGERS_TESTNET_PRIVATE_KEY] : [],
    },
    goerli_testnet: {
      url: process.env.GOERLI_TESTNET_URL || "",
      accounts: process.env.GOERLI_TESTNET_PRIVATE_KEY !== undefined ? [process.env.GOERLI_TESTNET_PRIVATE_KEY] : [],
    },
    polygon_mainnet: {
      url: process.env.POLYGON_MAINNET_URL || "",
      accounts: process.env.POLYGON_MAINNET_PRIVATE_KEY !== undefined ? [process.env.POLYGON_MAINNET_PRIVATE_KEY] : [],
    },
    bsc_mainnet: {
      url: process.env.BSC_MAINNET_URL || "",
      accounts: process.env.BSC_MAINNET_PRIVATE_KEY !== undefined ? [process.env.BSC_MAINNET_PRIVATE_KEY] : [],
    },
    rangers_mainnet: {
      url: process.env.RANGERS_MAINNET_URL || "",
      accounts: process.env.RANGERS_MAINNET_PRIVATE_KEY !== undefined ? [process.env.RANGERS_MAINNET_PRIVATE_KEY] : [],
    },
    eth_mainnet: {
      url: process.env.ETH_MAINNET_URL || "",
      accounts: process.env.ETH_MAINNET_PRIVATE_KEY !== undefined ? [process.env.ETH_MAINNET_PRIVATE_KEY] : [],
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
  mocha: {
    timeout: 100000000,
  },
  dependencyCompiler: {
    paths: ["@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol"],
  },
};

export default config;
