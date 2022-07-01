import { keccak256 } from "ethers/lib/utils";

console.log(
  "key set key:",
  keccak256(Buffer.from("unipass-wallet:module-auth:keyset", "utf8"))
);
console.log(
  "meta nonce key:",
  keccak256(Buffer.from("unipass-wallet:module-auth:meta-nonce", "utf8"))
);
