import { ethers } from "hardhat";

console.log(ethers.utils.keccak256(Buffer.from("unipass-wallet:dkim-keys:dkim-zk")));
