import { ethers } from "hardhat";
import NodeRsa from "node-rsa";

console.log(
  ethers.utils.solidityPack(
    ["bytes", "bytes"],
    [Buffer.from("1ca1ba"), Buffer.from("icloud.com")]
  )
);

const nodeRsa = new NodeRsa(
  `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAyYkk/RUsQWYCjdMay6Ds6ZWvQLF5/tgfJTYqonTqTLEuYP5lAzZjGGcUkDY4C15SBp2FAOWCkGrTwq56h+6e98HjoGNwr0BFG9b7FXtiFlTgu+uz+p3m2GKreDly3lYQ752gTBToY9YE+dkWbBoCehxn5YC9e5iNyJFSRa+AMaGlE8tMEONp
MBBadKKvULj4UuomD2+Gv8GV1zwyktiGyKLdJZATEktjcDeyVGSFDYD1Kqc/eCMohRT+Eep5EKDi1B5GZnGAVUOJuO3fWIVJ9TNga6HcvJQ8n8pNtDw9kwCejS2JKD0YR9YkUmGxMA8lV0PY4G0ua6FnxfBfNcgxJQIDAQAB
-----END PUBLIC KEY-----`
);

console.log(
  `0x${nodeRsa.exportKey("components-public").n.toString("hex").substring(2)}`
);
