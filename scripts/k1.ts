import { ethers } from "hardhat";

console.log(ethers.utils.keccak256(Buffer.from("unipass-wallet:module-admin-auth:admin")));
