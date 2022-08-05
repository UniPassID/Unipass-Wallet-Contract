import { ethers } from "hardhat";

console.log(
  ethers.utils.keccak256(
    Buffer.from(
      "unipass-wallet:module-hook-eip4337-wallet:eip4337-wallet-nonce"
    )
  )
);
