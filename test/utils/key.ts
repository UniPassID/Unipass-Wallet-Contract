import { BytesLike, Contract, Wallet } from "ethers";
import { arrayify, hexlify, joinSignature, randomBytes, solidityPack } from "ethers/lib/utils";
import { EmailType, getSignEmailWithDkim, parseEmailParams, pureEmailHash, SerializeDkimParams } from "./email";
import { Role, signerSign } from "./sigPart";

export enum KeyType {
  Secp256k1,
  ERC1271Wallet,
  EmailAddress,
}

export interface RoleWeight {
  ownerWeight: number;
  assetsOpWeight: number;
  guardianWeight: number;
}

function randomInt(max: number) {
  return Math.ceil(Math.random() * (max + 1));
}

export abstract class KeyBase {
  constructor(readonly roleWeight: RoleWeight) {}
  public abstract generateSignature(digestHash: BytesLike): Promise<string>;
  public abstract generateKey(): Promise<string>;
  public abstract serialize(): string;
  public serializeRoleWeight(): string {
    return solidityPack(
      ["uint32", "uint32", "uint32"],
      [this.roleWeight.ownerWeight, this.roleWeight.assetsOpWeight, this.roleWeight.guardianWeight]
    );
  }
}

export class KeySecp256k1 extends KeyBase {
  constructor(readonly inner: Wallet, roleWeight: RoleWeight) {
    super(roleWeight);
  }

  public async generateSignature(digestHash: string): Promise<string> {
    return solidityPack(
      ["uint8", "uint8", "bytes", "bytes"],
      [KeyType.Secp256k1, 1, await signerSign(digestHash, this.inner), this.serializeRoleWeight()]
    );
  }

  public async generateKey(): Promise<string> {
    return solidityPack(
      ["uint8", "uint8", "address", "bytes"],
      [KeyType.Secp256k1, 0, this.inner.address, this.serializeRoleWeight()]
    );
  }
  public serialize(): string {
    return solidityPack(["uint8", "address", "bytes"], [KeyType.Secp256k1, this.inner.address, this.serializeRoleWeight()]);
  }
}

export class KeyEmailAddress extends KeyBase {
  constructor(
    readonly emailAddress: string,
    readonly pepper: string,
    readonly unipassPrivateKey: string,
    roleWeight: RoleWeight,
    public emailType: EmailType
  ) {
    super(roleWeight);
  }
  public async generateSignature(digestHash: string): Promise<string> {
    let subject: string;
    switch (this.emailType) {
      case EmailType.UpdateKeysetHash: {
        subject = `UniPass-Update-Account-${digestHash}`;
        break;
      }
      case EmailType.LockKeysetHash: {
        subject = `UniPass-Start-Recovery-${digestHash}`;
        break;
      }
      case EmailType.CancelLockKeysetHash: {
        subject = `UniPass-Cancel-Recovery-${digestHash}`;
        break;
      }
      case EmailType.UpdateTimeLockDuring: {
        subject = `UniPass-Update-Timelock-${digestHash}`;
        break;
      }
      case EmailType.UpdateImplementation: {
        subject = `UniPass-Update-Implementation-${digestHash}`;
        break;
      }
      case EmailType.CallOtherContract: {
        subject = `UniPass-Call-Contract-${digestHash}`;
        break;
      }
      default:
        throw new Error(`Invalid EmailType: ${this.emailType}`);
    }
    let email = await getSignEmailWithDkim(subject, this.emailAddress, "test@unipass.me", this.unipassPrivateKey);
    let { params } = await parseEmailParams(email);
    return solidityPack(
      ["uint8", "uint8", "bytes32", "bytes", "bytes"],
      [KeyType.EmailAddress, 1, this.pepper, SerializeDkimParams(params, this.emailType), this.serializeRoleWeight()]
    );
  }
  public async generateKey(): Promise<string> {
    return solidityPack(
      ["uint8", "uint8", "bytes32", "bytes"],
      [KeyType.EmailAddress, 0, pureEmailHash(this.emailAddress, this.pepper), this.serializeRoleWeight()]
    );
  }
  public serialize(): string {
    return solidityPack(
      ["uint8", "bytes32", "bytes"],
      [KeyType.EmailAddress, pureEmailHash(this.emailAddress, this.pepper), this.serializeRoleWeight()]
    );
  }
}

export class KeyERC1271Wallet extends KeyBase {
  constructor(readonly walletAddr: BytesLike, readonly inner: Wallet, roleWeight: RoleWeight) {
    super(roleWeight);
  }

  public async generateSignature(digestHash: string): Promise<string> {
    const sig = joinSignature(this.inner._signingKey().signDigest(arrayify(digestHash)));
    return solidityPack(
      ["uint8", "uint8", "address", "uint32", "bytes", "bytes"],
      [KeyType.ERC1271Wallet, 1, this.walletAddr, sig.length / 2 - 1, sig, this.serializeRoleWeight()]
    );
  }

  public async generateKey(): Promise<string> {
    return solidityPack(
      ["uint8", "uint8", "address", "bytes"],
      [KeyType.ERC1271Wallet, 0, this.walletAddr, this.serializeRoleWeight()]
    );
  }
  public serialize(): string {
    return solidityPack(["uint8", "address", "bytes"], [KeyType.ERC1271Wallet, this.walletAddr, this.serializeRoleWeight()]);
  }
}

export async function randomKeys(len: number, unipassPrivateKey: string, contracts: [Contract, Wallet][]): Promise<KeyBase[]> {
  let ret: KeyBase[] = [];
  for (let i = 0; i < len; i++) {
    for (const role of [Role.Owner, Role.AssetsOp, Role.Guardian]) {
      let random = randomInt(2);
      if (random === 0) {
        ret.push(new KeySecp256k1(Wallet.createRandom(), randomRoleWeight(role)));
      } else if (random === 1) {
        ret.push(new KeyERC1271Wallet(contracts[i][0].address, contracts[i][1], randomRoleWeight(role)));
      } else {
        ret.push(
          new KeyEmailAddress(
            `${Buffer.from(randomBytes(10)).toString("hex")}@unipass.com`,
            hexlify(randomBytes(32)),
            unipassPrivateKey,
            randomRoleWeight(role),
            EmailType.CallOtherContract
          )
        );
      }
    }
  }
  return ret;
}

export async function randomNewWallet(unipassPrivateKey: string): Promise<KeyBase[]> {
  let ret: KeyBase[] = [];
  ret.push(new KeySecp256k1(Wallet.createRandom(), { ownerWeight: 40, assetsOpWeight: 100, guardianWeight: 0 }));
  ret.push(
    new KeyEmailAddress(
      `${Buffer.from(randomBytes(10)).toString("hex")}@unipass.com`,
      hexlify(randomBytes(32)),
      unipassPrivateKey,
      {
        ownerWeight: 60,
        assetsOpWeight: 0,
        guardianWeight: 60,
      },
      EmailType.CallOtherContract
    )
  );
  ret.push(
    new KeyEmailAddress(
      `${Buffer.from(randomBytes(10)).toString("hex")}@unipass.com`,
      hexlify(randomBytes(32)),
      unipassPrivateKey,
      {
        ownerWeight: 40,
        assetsOpWeight: 0,
        guardianWeight: 0,
      },
      EmailType.CallOtherContract
    )
  );

  return ret;
}

export function randomRoleWeight(role: Role): RoleWeight {
  if (role === Role.Owner) {
    return {
      ownerWeight: randomInt(40) + 10,
      assetsOpWeight: 0,
      guardianWeight: 0,
    };
  } else if (role === Role.AssetsOp) {
    return {
      ownerWeight: 0,
      assetsOpWeight: randomInt(40) + 10,
      guardianWeight: 0,
    };
  } else if (role === Role.Guardian) {
    return {
      ownerWeight: 0,
      assetsOpWeight: 0,
      guardianWeight: randomInt(40) + 10,
    };
  } else {
    throw new Error(`Invalid Role: ${role}`);
  }
}

export function selectKeys(keys: KeyBase[], role: Role, threshold: number): [KeyBase, boolean][] {
  let indexes: number[] = [];
  let sum = 0;
  keys
    .map((v, i) => {
      let value;
      if (role === Role.Owner) {
        value = v.roleWeight.ownerWeight;
      } else if (role === Role.AssetsOp) {
        value = v.roleWeight.assetsOpWeight;
      } else if (role === Role.Guardian) {
        value = v.roleWeight.guardianWeight;
      } else {
        throw new Error(`Invalid Role: ${role}`);
      }
      return { index: i, value };
    })
    .sort((a, b) => b.value - a.value)
    .forEach((v) => {
      if (sum < threshold) {
        indexes.push(v.index);
        sum += v.value;
      }
    });
  return keys.map((key, i) => {
    if (indexes.includes(i)) {
      return [key, true];
    } else {
      return [key, false];
    }
  });
}
