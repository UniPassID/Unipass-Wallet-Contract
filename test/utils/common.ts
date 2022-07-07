import { Wallet } from "ethers";
import { getCreate2Address, keccak256, solidityPack } from "ethers/lib/utils";
import { emailHash } from "./email";

export const optimalGasLimit = ethers.constants.Two.pow(21);

export function throwError(msg: string) {
  throw msg;
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
        [keysetHash, emailHash(recoveryEmail)]
      )
    );
  });
  return keysetHash;
}

export function generateRecoveryEmails(length: number): string[] {
  return [...Array(length)].map(() => {
    const recoveryEmail =
      Wallet.createRandom().privateKey.substring(16) + "@mail.unipass.me";
    return recoveryEmail;
  });
}

export function getProxyAddress(
  moduleMainAddress: string,
  dkimKeysAddress: string,
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
  const salt = keccak256(
    solidityPack(["bytes32", "address"], [keysetHash, dkimKeysAddress])
  );
  const expectedAddress = getCreate2Address(factoryAddress, salt, codeHash);
  return expectedAddress;
}
