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
    "0x4cB90069A9C6143E9F37fe5625ecbc0db3B88435",
    "0xEA217a9DA14835c8a1CaDFa048f2375Bba93e1bE",
    "0xD1313D1A01CC65F193AAC61f7b39F9DCff69d9Eb",
    "0xd4777C529D8d65dba9b0eCB09d4e58cDeeADB8fe",
    "0x10173a408193E1f6B7e7B253c076F7D593668AC5",
    "0x7e0daf27f95d7444a67ead7c7060c23d4ab05c27",
    "0x0d730c79108b88db1f6d665dc25c4f11dc1e2f7c",
    "0x20d893bb9f3cb3b31949e5351338ee8857c5bad0",
    "0x44d51a1f2a00695ce1b9f8f2ddf482e35a280b0d",
    "0x264ac2c4bda11f824b468ee16895f8adc17fbb88",
    "0x12918cae19193e39875afdc284223d27d6d01bd9",
    "0xd7a4ba360a6d8b6867a79ae80a7de55d4c7b0fc2",
    "0x0798ba216cfbd579f135d91663deb165edb270bc",
    "0xfe4d581b34785cf63eaeaf738d88f58798647be3",
    "0xc5405927901be723e927e9b7a84289eb7a0b66f5",
  ]) {
    const ret = await (await signer.sendTransaction({ to: addr, value: parseEther("1") })).wait();
    expect(ret.status).to.equal(1);
  }
}

main();
