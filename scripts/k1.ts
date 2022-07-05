import { ethers } from "hardhat";

console.log(
  ethers.utils.recoverAddress(
    "0x5c23cb0aa75e52e7729267c3b0713c889ba3346d08eedb5d1154cf06704a782a",
    "0x575a5a4e94fa1de2bba79890dd5821d0d011c357ae7be3489b47083b6e504dd0054331cbf09fba53c29290ae97bcb3d51648e63304050cc56ab6bf186a3789591b"
  )
);
