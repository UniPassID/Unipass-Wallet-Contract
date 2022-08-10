import { randomInt } from "crypto";
import { BytesLike, Wallet } from "ethers";
import { randomBytes, solidityPack } from "ethers/lib/utils";
import {
  getSignEmailWithDkim,
  parseEmailParams,
  SerializeDkimParams,
} from "./email";
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
  synchronizerWeight: number;
}

export abstract class KeyBase {
  constructor(readonly roleWeight: RoleWeight) {}
  public abstract generateSignature(digestHash: BytesLike): Promise<string>;
  public abstract generateKey(): Promise<string>;
  public abstract serialize(): string;
  public serializeRoleWeight(): string {
    return solidityPack(
      ["uint32", "uint32", "uint32", "uint32"],
      [
        this.roleWeight.ownerWeight,
        this.roleWeight.assetsOpWeight,
        this.roleWeight.guardianWeight,
        this.roleWeight.synchronizerWeight,
      ]
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
      [
        KeyType.Secp256k1,
        1,
        await signerSign(digestHash, this.inner),
        this.serializeRoleWeight(),
      ]
    );
  }

  public async generateKey(): Promise<string> {
    return solidityPack(
      ["uint8", "uint8", "address", "bytes"],
      [KeyType.Secp256k1, 0, this.inner.address, this.serializeRoleWeight()]
    );
  }
  public serialize(): string {
    return solidityPack(
      ["uint8", "address", "bytes"],
      [KeyType.Secp256k1, this.inner.address, this.serializeRoleWeight()]
    );
  }
}

export class KeyEmailAddress extends KeyBase {
  constructor(readonly emailAddress: string, roleWeight: RoleWeight) {
    super(roleWeight);
  }
  public async generateSignature(digestHash: string): Promise<string> {
    let email = await getSignEmailWithDkim(
      digestHash,
      this.emailAddress,
      "test@unipass.me"
    );
    let { params } = await parseEmailParams(email);
    return solidityPack(
      ["uint8", "uint8", "uint32", "bytes", "bytes", "bytes"],
      [
        KeyType.EmailAddress,
        1,
        this.emailAddress.length,
        Buffer.from(this.emailAddress, "utf-8"),
        SerializeDkimParams(params),
        this.serializeRoleWeight(),
      ]
    );
  }
  public async generateKey(): Promise<string> {
    return solidityPack(
      ["uint8", "uint8", "uint32", "bytes", "bytes"],
      [
        KeyType.EmailAddress,
        0,
        this.emailAddress.length,
        Buffer.from(this.emailAddress, "utf-8"),
        this.serializeRoleWeight(),
      ]
    );
  }
  public serialize(): string {
    return solidityPack(
      ["uint8", "uint32", "bytes", "bytes"],
      [
        KeyType.EmailAddress,
        this.emailAddress.length,
        Buffer.from(this.emailAddress, "utf-8"),
        this.serializeRoleWeight(),
      ]
    );
  }
}

export function randomKeys(len: number): KeyBase[] {
  let ret: KeyBase[] = [];
  for (let i = 0; i < len; i++) {
    for (const role of [
      Role.Owner,
      Role.AssetsOp,
      Role.Guardian,
      Role.Synchronizer,
    ]) {
      let random = randomInt(1);
      if (random === 0) {
        ret.push(
          new KeySecp256k1(Wallet.createRandom(), randomRoleWeight(role))
        );
      } else {
        ret.push(
          new KeyEmailAddress(
            Buffer.from(randomBytes(10)).toString("hex"),
            randomRoleWeight(role)
          )
        );
      }
    }
  }
  return ret;
}

export function randomRoleWeight(role: Role): RoleWeight {
  if (role === Role.Owner) {
    return {
      ownerWeight: randomInt(40) + 10,
      assetsOpWeight: 0,
      guardianWeight: 0,
      synchronizerWeight: 0,
    };
  } else if (role === Role.AssetsOp) {
    return {
      ownerWeight: 0,
      assetsOpWeight: randomInt(40) + 10,
      guardianWeight: 0,
      synchronizerWeight: 0,
    };
  } else if (role === Role.Guardian) {
    return {
      ownerWeight: 0,
      assetsOpWeight: 0,
      guardianWeight: randomInt(40) + 10,
      synchronizerWeight: 0,
    };
  } else if (role === Role.Synchronizer) {
    return {
      ownerWeight: 0,
      assetsOpWeight: 0,
      guardianWeight: 0,
      synchronizerWeight: randomInt(40) + 10,
    };
  } else {
    throw new Error(`Invalid Role: ${role}`);
  }
}

export function selectKeys(keys: KeyBase[], role: Role): [KeyBase, boolean][] {
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
      } else if (role === Role.Synchronizer) {
        value = v.roleWeight.synchronizerWeight;
      } else {
        throw new Error(`Invalid Role: ${role}`);
      }
      return { index: i, value };
    })
    .sort((a, b) => b.value - a.value)
    .forEach((v) => {
      if (sum < 100) {
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
