import { expect } from "chai";
import { BigNumber, providers } from "ethers";
import { parseEther } from "ethers/lib/utils";
import { network } from "hardhat";

const provider = new providers.Web3Provider(network.provider.send);
const signer = provider.getSigner();
const txParams = {
  gasLimit: 10000000,
  gasPrice: BigNumber.from(10).pow(9).mul(16),
};

async function main() {
  for (const addr of [
    "0x379eea612c1a1b6a8c63e3c17cc19910b8a47376",
    "0x5ce8332e1605eac27ad2535d3a9366d09b3a646f",
    "0x413c3105954945bfffff263bd4c044d16a4ba79e",
    "0xf3639b1d454f8ba382ef732f9b58717993a0e28e",
    "0x9242ea3c4b32dbab17bc0f861118bd72062c57e0",
    "0xc25e854cd5a318ca73999638e74f70329efccef1",
    "0x3decce449859af7ad471ded2f56069d465160e61",
    "0xe67c592ad6f242a7fa82a6b96af6c505818961f8",
    "0x5532c8b8efa8cd81afd1f9de988cdee6ae2443d3",
    "0xca8871336e1973c5dbcd46dbbca2576f703990a8",
    "0x8c6caa65b67b069c8f02d32a05a5139de973c8ef",
    "0x03dec4b534a6c17bedd489de330b2f89ff3a115a",
    "0x2698e40a9d94fcc3f9d1aff04c8f53fe041636df",
    "0x32591fd2e5f35f6f80915dbec66f15c4cd56f59c",
    "0x55cfaf2796a47b5a1adb086787e52c9991cb05cc",
  ]) {
    const ret = await (await signer.sendTransaction({ to: addr, value: parseEther("1") })).wait();
    expect(ret.status).to.equal(1);
  }
}

main();
