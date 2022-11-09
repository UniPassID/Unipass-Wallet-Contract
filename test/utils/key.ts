import { BytesLike, constants, Contract, Wallet } from "ethers";
import { arrayify, hexlify, joinSignature, keccak256, randomBytes, sha256, solidityPack, toUtf8Bytes } from "ethers/lib/utils";
import {
  EmailType,
  getDkimParams,
  getSignEmailWithDkim,
  parseDkimResult,
  parseEmailParams,
  pureEmailHash,
  SerializeDkimParams,
  Signature,
} from "./email";
import { Role, signerSign } from "./sigPart";
import * as jose from "jose";
import { buildResponse, OPENID_AUDIENCE, OPENID_ISSUER, OPENID_KID } from "./common";
import NodeRSA from "node-rsa";
import fetchPonyfill from "fetch-ponyfill";

export enum KeyType {
  Secp256k1,
  ERC1271Wallet,
  OpenIDWithEmail,
}

export interface RoleWeight {
  ownerWeight: number;
  assetsOpWeight: number;
  guardianWeight: number;
}

function randomInt(max: number) {
  const rand = Math.random();
  return Math.floor(rand * (max + 1));
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

export interface EmailOptions {
  _isEmailOptions: true;
  type: "ZK" | "Origin";
  zkServerUrl?: string;
  emailAddress: string;
  pepper: string;
  unipassPrivateKey: string;
  emailType: EmailType;

  openIDHash: string;
}

export function isEmailOptions(v: any): v is EmailOptions {
  return v._isEmailOptions;
}

export function isOpenIDOptions(v: any): v is EmailOptions {
  return v._isOpenIDOptions;
}

export interface OpenIDOptions {
  _isOpenIDOptions: true;
  unipassPrivateKey: string;
  issuer: string;
  audience: string;
  sub: string;
  kid: string;

  emailHash: string;
}

export class KeyOpenIDWithEmail extends KeyBase {
  private fetch;
  constructor(readonly inner: EmailOptions | OpenIDOptions, roleWeight: RoleWeight) {
    super(roleWeight);
    this.fetch = fetchPonyfill().fetch;
  }

  public async generateSignature(digestHash: string): Promise<string> {
    if (isEmailOptions(this.inner)) {
      let subject: string;
      switch (this.inner.emailType) {
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
        case EmailType.SyncAccount: {
          subject = `UniPass-Sync-Account-${digestHash}`;
          break;
        }
        default:
          throw new Error(`Invalid EmailType: ${this.inner.emailType}`);
      }
      let email = await getSignEmailWithDkim(subject, this.inner.emailAddress, "test@unipass.me", this.inner.unipassPrivateKey);
      switch (this.inner.type) {
        case "Origin": {
          let { params } = await parseEmailParams(email);
          return solidityPack(
            ["uint8", "uint8", "uint8", "bytes32", "uint8", "bytes", "bytes32", "bytes"],
            [
              KeyType.OpenIDWithEmail,
              1,
              1,
              this.inner.openIDHash,
              0,
              SerializeDkimParams(params, this.inner.emailType),
              this.inner.pepper,
              this.serializeRoleWeight(),
            ]
          );
        }
        case "ZK": {
          const [, from, oriResults] = await parseDkimResult(email);
          const results = oriResults.filter((result) => {
            const signature = result.signature as any as Signature;
            return signature.domain !== "1e100.net";
          });
          let res = await this.fetch(this.inner.zkServerUrl + "/request_proof", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              emailHeader: hexlify(toUtf8Bytes(results[0].processedHeader)),
              fromPepper: this.inner.pepper,
              headerHash: sha256(toUtf8Bytes(results[0].processedHeader)),
            }),
          });
          let hash = await buildResponse(res);
          let ret;
          while (!ret) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            res = await this.fetch(`${this.inner.zkServerUrl}/query_proof/${hash}`, {
              method: "GET",
            });
            ret = await buildResponse(res);
          }
          const params = getDkimParams(results, from);
          params.emailHeader = ret.headerPubMatch;
          let data = solidityPack(
            [
              "uint8",
              "uint8",
              "uint8",
              "bytes32",
              "uint8",
              "bytes",
              "uint128",
              "uint32",
              "uint256[]",
              "uint32",
              "uint256[]",
              "uint32",
              "uint256[]",
              "bytes",
            ],
            [
              KeyType.OpenIDWithEmail,
              1,
              1,
              this.inner.openIDHash,
              1,
              SerializeDkimParams(params, this.inner.emailType),
              ret.domainSize,
              ret.publicInputs.length,
              ret.publicInputs,
              ret.vkData.length,
              ret.vkData,
              ret.proof.length,
              ret.proof,
              this.serializeRoleWeight(),
            ]
          );
          return data;
        }
      }
    } else {
      let access_token = await new jose.SignJWT({ nonce: digestHash })
        .setProtectedHeader({ alg: "RS256", kid: this.inner.kid })
        .setIssuer(this.inner.issuer)
        .setAudience(this.inner.audience)
        .setExpirationTime("2h")
        .setIssuedAt(Date.now() / 1000 - 300)
        .setSubject(this.inner.sub)
        .sign(await jose.importPKCS8(this.inner.unipassPrivateKey, "RS256"));
      const [headerBase64, payloadBase64, signatureBase64] = access_token.split(".");
      const header = Buffer.from(headerBase64, "base64").toString();
      const payload = Buffer.from(payloadBase64, "base64").toString();

      const signature = Buffer.from(signatureBase64, "base64");
      const issLeftIndex = payload.indexOf('"iss":"') + 7;
      let issRightIndex = payload.indexOf('",', issLeftIndex);
      issRightIndex = issRightIndex >= 0 ? issRightIndex : payload.indexOf('"}', issLeftIndex);
      const kidLeftIndex = header.indexOf('"kid":"') + 7;
      let kidRightIndex = header.indexOf('",', kidLeftIndex);
      kidRightIndex = kidRightIndex >= 0 ? kidRightIndex : header.indexOf('"}', kidLeftIndex);

      const iatLeftIndex = payload.indexOf('"iat":') + 6;
      const expLeftIndex = payload.indexOf('"exp":') + 6;

      const subLeftIndex = payload.indexOf('"sub":"') + 7;
      let subRightIndex = payload.indexOf('",', subLeftIndex);
      subRightIndex = subRightIndex >= 0 ? subRightIndex : payload.indexOf('"}', subLeftIndex);

      const audLeftIndex = payload.indexOf('"aud":"') + 7;
      let audRightIndex = payload.indexOf('",', audLeftIndex);
      audRightIndex = audRightIndex >= 0 ? audRightIndex : payload.indexOf('"}', audLeftIndex);

      const nonceLeftIndex = payload.indexOf('"nonce":"') + 9;

      return solidityPack(
        [
          "uint8",
          "uint8",
          "uint8",
          "bytes32",
          "uint32",
          "uint32",
          "uint32",
          "uint32",
          "uint32",
          "uint32",
          "uint32",
          "uint32",
          "uint32",
          "uint32",
          "uint32",
          "uint32",
          "bytes",
          "uint32",
          "bytes",
          "uint32",
          "bytes",
          "bytes",
        ],
        [
          KeyType.OpenIDWithEmail,
          1,
          2,
          this.inner.emailHash,
          issLeftIndex,
          issRightIndex,
          kidLeftIndex,
          kidRightIndex,
          subLeftIndex,
          subRightIndex,
          audLeftIndex,
          audRightIndex,
          nonceLeftIndex,
          iatLeftIndex,
          expLeftIndex,
          toUtf8Bytes(header).length,
          toUtf8Bytes(header),
          toUtf8Bytes(payload).length,
          toUtf8Bytes(payload),
          signature.length,
          signature,
          this.serializeRoleWeight(),
        ]
      );
    }
  }

  getHash(): string {
    if (isEmailOptions(this.inner)) {
      return keccak256(
        solidityPack(["bytes32", "bytes32"], [pureEmailHash(this.inner.emailAddress, this.inner.pepper), this.inner.openIDHash])
      );
    }
    return keccak256(
      solidityPack(
        ["bytes32", "bytes32"],
        [
          this.inner.emailHash,
          keccak256(
            solidityPack(
              ["bytes32", "bytes32"],
              [keccak256(toUtf8Bytes(this.inner.issuer)), keccak256(toUtf8Bytes(this.inner.sub))]
            )
          ),
        ]
      )
    );
  }

  public async generateKey(): Promise<string> {
    return solidityPack(
      ["uint8", "uint8", "bytes32", "bytes"],
      [KeyType.OpenIDWithEmail, 0, this.getHash(), this.serializeRoleWeight()]
    );
  }
  public serialize(): string {
    return solidityPack(["uint8", "bytes32", "bytes"], [KeyType.OpenIDWithEmail, this.getHash(), this.serializeRoleWeight()]);
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

export async function randomKeys(
  unipassPrivateKey: NodeRSA,
  contracts: [Contract, Wallet][],
  zkServerUrl?: string
): Promise<KeyBase[]> {
  let ret: KeyBase[] = [];
  for (let i = 0; i < 20; i++) {
    for (const role of [Role.Owner, Role.AssetsOp, Role.Guardian]) {
      const maxInt = zkServerUrl ? 4 : 3;
      let random = randomInt(maxInt);
      if (random === 0) {
        ret.push(new KeySecp256k1(Wallet.createRandom(), randomRoleWeight(role)));
      } else if (random === 1) {
        ret.push(new KeyERC1271Wallet(contracts[i][0].address, contracts[i][1], randomRoleWeight(role)));
      } else if (random === 2) {
        ret.push(
          new KeyOpenIDWithEmail(
            {
              _isEmailOptions: true,
              type: "Origin",
              emailAddress: `${Buffer.from(randomBytes(10)).toString("hex")}@unipass.com`,
              pepper: hexlify(randomBytes(32)),
              unipassPrivateKey: unipassPrivateKey.exportKey("pkcs1"),
              emailType: EmailType.CallOtherContract,
              openIDHash: constants.HashZero,
              zkServerUrl,
            },
            randomRoleWeight(role)
          )
        );
      } else if (random === 3) {
        ret.push(
          new KeyOpenIDWithEmail(
            {
              _isOpenIDOptions: true,
              unipassPrivateKey: unipassPrivateKey.exportKey("pkcs8"),
              issuer: OPENID_ISSUER,
              kid: OPENID_KID,
              audience: OPENID_AUDIENCE,
              sub: hexlify(randomBytes(10)),
              emailHash: constants.HashZero,
            },
            randomRoleWeight(role)
          )
        );
      } else if (random === 4) {
        ret.push(
          new KeyOpenIDWithEmail(
            {
              _isEmailOptions: true,
              type: "ZK",
              emailAddress: `${Buffer.from(randomBytes(10)).toString("hex")}@unipass.com`,
              pepper: hexlify(randomBytes(32)),
              zkServerUrl,
              unipassPrivateKey: unipassPrivateKey.exportKey("pkcs1"),
              emailType: EmailType.CallOtherContract,
              openIDHash: constants.HashZero,
            },
            randomRoleWeight(role)
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
    new KeyOpenIDWithEmail(
      {
        _isEmailOptions: true,
        type: "Origin",
        emailAddress: `${Buffer.from(randomBytes(10)).toString("hex")}@unipass.com`,
        pepper: hexlify(randomBytes(32)),
        unipassPrivateKey,

        emailType: EmailType.CallOtherContract,
        openIDHash: constants.HashZero,
      },
      {
        ownerWeight: 60,
        assetsOpWeight: 0,
        guardianWeight: 60,
      }
    )
  );
  ret.push(
    new KeyOpenIDWithEmail(
      {
        _isEmailOptions: true,
        type: "ZK",
        emailAddress: `${Buffer.from(randomBytes(10)).toString("hex")}@unipass.com`,
        pepper: hexlify(randomBytes(32)),
        unipassPrivateKey,

        emailType: EmailType.CallOtherContract,
        openIDHash: constants.HashZero,
      },
      {
        ownerWeight: 40,
        assetsOpWeight: 0,
        guardianWeight: 0,
      }
    )
  );

  return ret;
}

export function randomRoleWeight(role: Role): RoleWeight {
  if (role === Role.Owner) {
    return {
      ownerWeight: randomInt(30) + 5,
      assetsOpWeight: 0,
      guardianWeight: 0,
    };
  } else if (role === Role.AssetsOp) {
    return {
      ownerWeight: 0,
      assetsOpWeight: randomInt(30) + 5,
      guardianWeight: 0,
    };
  } else if (role === Role.Guardian) {
    return {
      ownerWeight: 0,
      assetsOpWeight: 0,
      guardianWeight: randomInt(30) + 5,
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
