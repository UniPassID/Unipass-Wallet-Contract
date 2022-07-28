import { getCreate2Address, keccak256 } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { pureEmailHash } from "./email";

export const optimalGasLimit = ethers.constants.Two.pow(21);

export function throwError(msg: string) {
  throw msg;
}

export async function transferEth(to: string, amount: number) {
  return await (
    await (
      await ethers.getSigners()
    )[0].sendTransaction({
      to,
      value: ethers.utils.parseEther(amount.toString()),
    })
  ).wait();
}

export function getKeysetHash(
  masterKeyAddress: string,
  threshold: number,
  recoveryEmails: string[]
): string {
  let keysetHash = keccak256(
    ethers.utils.solidityPack(
      ["address", "uint16"],
      [masterKeyAddress, threshold]
    )
  );
  recoveryEmails.forEach((recoveryEmail) => {
    keysetHash = keccak256(
      ethers.utils.solidityPack(
        ["bytes32", "bytes32"],
        [keysetHash, pureEmailHash(recoveryEmail)]
      )
    );
  });
  return keysetHash;
}

export function generateRecoveryEmails(length: number): string[] {
  return [...Array(length)].map(() => {
    var result = "";
    var characters =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    var charactersLength = characters.length;
    for (var i = 0; i < 16; i++) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return `${result}@mail.unipass.me`;
  });
}

export function getProxyAddress(
  moduleMainAddress: string,
  factoryAddress: string,
  keysetHash: string
): string {
  const code = ethers.utils.solidityPack(
    ["bytes", "uint256"],
    [
      "0x603a600e3d39601a805130553df3363d3d373d3d3d363d30545af43d82803e903d91601857fd5bf3",
      moduleMainAddress,
    ]
  );
  const codeHash = keccak256(code);

  const expectedAddress = getCreate2Address(
    factoryAddress,
    keysetHash,
    codeHash
  );
  return expectedAddress;
}
