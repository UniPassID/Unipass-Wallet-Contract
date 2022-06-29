import { keccak256 } from "ethers/lib/utils";

console.log(
  keccak256(Buffer.from("unipass-wallet:module-auth:keyset", "utf8"))
);
