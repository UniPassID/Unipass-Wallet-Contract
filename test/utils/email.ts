import { sha256 } from "ethereumjs-util";
import DKIM from "nodemailer/lib/dkim";
import MailComposer from "nodemailer/lib/mail-composer";
import * as Dkim from "dkim";
import NodeRSA from "node-rsa";
import { solidityPack } from "ethers/lib/utils";
const mailParser = require("mailparser");

const MAX_EMAIL_LEN = 100;
const FR_EMAIL_LEN = Math.floor(MAX_EMAIL_LEN / 31) + 1;
const MIN_EMAIL_LEN = 6;

export interface Signature {
  signature: Buffer;
  domain: string;
  selector: string;
}

export interface DkimParams {
  emailHeader: string;
  dkimSig: string;
  fromIndex: number;
  fromLeftIndex: number;
  fromRightIndex: number;
  subjectIndex: number;
  subjectRightIndex: number;
  subject: Buffer[];
  subjectPadding: Buffer;
  isSubBase64: boolean[];
  dkimHeaderIndex: number;
  sdidIndex: number;
  sdidRightIndex: number;
  selectorIndex: number;
  selectorRightIndex: number;
}

/**
 * 
 * @param params Solidity Dkim Validating Params
 * @returns Params Serializing String
 */
export function SerializeDkimParams(params: DkimParams): string {
  let sig = solidityPack(
    ["uint32", "bytes"],
    [params.emailHeader.length / 2 - 1, params.emailHeader]
  );
  sig = solidityPack(
    ["bytes", "uint32", "bytes"],
    [sig, params.dkimSig.length / 2 - 1, params.dkimSig]
  );
  sig = solidityPack(
    ["bytes", "uint32", "uint32", "uint32", "uint32", "uint32"],
    [
      sig,
      params.fromIndex,
      params.fromLeftIndex,
      params.fromRightIndex,
      params.subjectIndex,
      params.subjectRightIndex,
    ]
  );
  sig = solidityPack(["bytes", "uint32"], [sig, params.isSubBase64.length]);
  for (const isBase64 of params.isSubBase64) {
    sig = solidityPack(["bytes", "uint8"], [sig, isBase64 ? 1 : 0]);
  }
  sig = solidityPack(
    ["bytes", "uint32", "bytes"],
    [sig, params.subjectPadding.length, params.subjectPadding]
  );
  sig = solidityPack(["bytes", "uint32"], [sig, params.subject.length]);
  for (const subject of params.subject) {
    sig = solidityPack(
      ["bytes", "uint32", "bytes"],
      [sig, subject.length, subject]
    );
  }
  sig = solidityPack(
    ["bytes", "uint32", "uint32", "uint32", "uint32", "uint32"],
    [
      sig,
      params.dkimHeaderIndex,
      params.selectorIndex,
      params.selectorRightIndex,
      params.sdidIndex,
      params.sdidRightIndex,
    ]
  );
  return sig;
}

const PrivateKey = `-----BEGIN PRIVATE KEY-----
MIICeAIBADANBgkqhkiG9w0BAQEFAASCAmIwggJeAgEAAoGBAI10xX5sJzYGC2Z8
cb+gvuyG8TuJ4pUC9TcQHeavPcGp4eMdFJDd1zlQnWxe1/rs/tE5JmXzEpOcPwMU
cAwvIuONVNP1fEIxAb/6e4B/jJ4OJhno7PY9GvriKuYmkSaoqaw7bsvYF2+AZfJ1
aIpVmODci3elNBhzxQJMLRwPPmKNAgMBAAECgYEAjPQGt2rdx59OTNlEH0b1+Iqe
Zk2HUiSYZD3TDcMhLpExXTXlAFWN2LbTpuD7JjZx09m2wW/s2tmekFsVK47sm4FN
qYClat6zNWMMfir0VgmZEwJM/5+DmOPsUV2fsMjZtbdjzuFXTGUzO4yOw+6QF0e9
IdWH5MJTC6WYWM8dYQECQQDjJGaSJkfc/F9K1CyCrwDFu2uS3vAakXVCQsQFx9cZ
byx80hIedv9OrjRjuo7XcuI+rQUEwNkKotHyJ5yH3AY5AkEAn22B76Y3h13Uwpab
nlVw4j76H1xzSPEbF9ed3vyfp0XLahaZ56P1pimkisFkmBF2KmFftKPRIvrOsOA3
Vn/e9QJAbg0v6TXE8cwRO4crfbHe1O7mwwVjHexF/PGuWgKmNDuKOXvqrXoIXw3G
cl9sX/TYq3dXDCOHxUB4KjSJAcZX+QJBAIfMr7GC1CnqMyDNSSFFhjIxkrzD8y9e
sMVOVJtsdFH3kZ18QvydHNG9BvtqYFVoCk9vQiaMo8g3+3eOhZSYt0ECQQDhfNDl
J4lYLr2WiL5TodldQleat9+CfMIX6J0uJxGseGnRLEzSnPRUjibEDuaQTFB2Toyi
mEPpCtAZQUdfBvYP
-----END PRIVATE KEY-----`;

export const NodePriKey = new NodeRSA(PrivateKey);

export const UnipassIdKey = new NodeRSA({
  e: 65537,
  n: Buffer.from(
    "8d74c57e6c2736060b667c71bfa0beec86f13b89e29502f537101de6af3dc1a9e1e31d1490ddd739509d6c5ed7faecfed1392665f312939c3f0314700c2f22e38d54d3f57c423101bffa7b807f8c9e0e2619e8ecf63d1afae22ae6269126a8a9ac3b6ecbd8176f8065f275688a5598e0dc8b77a5341873c5024c2d1c0f3e628d",
    "hex"
  ),
});

let node_key = UnipassIdKey.exportKey("pkcs8-public").split("\n");
node_key.shift();
node_key.pop();
const dkim_key = "k=rsa; p=" + node_key;
export const UnipassIdDkimKey = Dkim.Key.parse(dkim_key);

export async function getSignEmailWithDkim(
  subject: string,
  from: string,
  to: string
) {
  const mail = new MailComposer({
    from,
    to,
    subject,
    html: "<b>Unipass Test</b>",
  });

  const dkim = new DKIM({
    keySelector: "eth",
    domainName: "unipass.id",
    privateKey: PrivateKey,
  });
  const email = await signEmailWithDkim(mail, dkim);
  return email;
}

export async function signEmailWithDkim(mail: MailComposer, dkim: DKIM) {
  let msg = await mail.compile().build();
  const signedMsg = dkim.sign(msg);
  let buff = "";
  for await (const chunk of signedMsg) {
    buff += chunk;
  }

  return buff;
}

function updateEmail(emailAddress: string) {
  if (!emailAddress) return "";
  if (
    emailAddress.length < MIN_EMAIL_LEN ||
    emailAddress.length > MAX_EMAIL_LEN
  ) {
    throw new Error("Invalid email length");
  }
  emailAddress = emailAddress.toLocaleLowerCase().trim();
  const emailData = emailAddress.split("@");
  let prefix = emailData[0].split("+")[0];
  if (emailData[1] != "gmail.com") return `${prefix}@${emailData[1]}`;
  const reg = new RegExp(/[\.]+/, "g");
  prefix = prefix.trim().replace(reg, "");
  return `${prefix}@${emailData[1]}`;
}

export function emailHash(emailAddress: string): string {
  emailAddress = updateEmail(emailAddress);
  if (!emailAddress) return "";

  const split = emailAddress.split("@", 2);
  let buf = Buffer.concat([
    Buffer.from(split[0]),
    Buffer.from("@"),
    Buffer.from(split[1]),
  ]);
  let i;
  const len = split[0].length + 1 + split[1].length;
  for (i = 0; i < FR_EMAIL_LEN * 31 - len; ++i)
    buf = Buffer.concat([buf, new Uint8Array([0])]);
  const hash = sha256(Buffer.from(buf));
  const hashRev = hash.reverse();
  hashRev[31] &= 0x1f;
  return "0x" + hashRev.toString("hex");
}

export function verifyDKIMContent(content: Buffer) {
  return new Promise((resolve, reject) => {
    Dkim.verify(content, false, (err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
}

export interface Signature {
  signature: Buffer;
  domain: string;
  selector: string;
}

export function getDkimParams(
  results: Dkim.VerifyResult[],
  subs: Buffer[],
  isSubBase64: boolean[],
  subjectPadding: string,
  fromHeader: string
): DkimParams {
  if (isSubBase64.length == 0) {
    isSubBase64.push(false);
  }
  for (let result of results) {
    let processedHeader = result.processedHeader;
    let fromIndex = processedHeader.indexOf("from:");
    let fromEndIndex = processedHeader.indexOf("\r\n", fromIndex);

    let fromLeftIndex = processedHeader.indexOf(
      "<" + fromHeader + ">",
      fromIndex
    );
    if (fromLeftIndex == -1 || fromLeftIndex > fromEndIndex) {
      fromLeftIndex = processedHeader.indexOf(fromHeader);
    } else {
      fromLeftIndex += 1;
    }
    let fromRightIndex = fromLeftIndex + fromHeader.length - 1;

    let signature = result.signature as any as Signature;
    if (signature.domain == "1e100.net") {
      continue;
    }

    const subjectIndex = processedHeader.indexOf("subject:");
    const dkimHeaderIndex = processedHeader.indexOf("dkim-signature:");
    const sdidIndex = processedHeader.indexOf(
      signature.domain,
      dkimHeaderIndex
    );
    const sdidRightIndex = sdidIndex + signature.domain.length;
    const selectorIndex = processedHeader.indexOf(
      signature.selector,
      dkimHeaderIndex
    );
    const selectorRightIndex = selectorIndex + signature.selector.length;
    let params = {
      emailHeader: "0x" + Buffer.from(processedHeader, "utf-8").toString("hex"),
      dkimSig: "0x" + signature.signature.toString("hex"),
      fromIndex,
      fromLeftIndex,
      fromRightIndex,
      subjectIndex,
      subjectRightIndex: processedHeader.indexOf("\r\n", subjectIndex),
      subject: subs,
      subjectPadding: Buffer.from(subjectPadding, "utf-8"),
      isSubBase64,
      dkimHeaderIndex,
      sdidIndex,
      sdidRightIndex,
      selectorIndex,
      selectorRightIndex,
    };
    return params;
  }
  throw "Email parsed failed";
}

export async function parseEmailParams(email: string): Promise<DkimParams> {
  let mail = await mailParser.simpleParser(email, {
    subjectSep: " ",
    isSepBase64: true,
  });

  let subs = {
    subs: [],
    subsAllLen: 0,
    subjectPadding: "",
    subIsBase64: [],
  };
  mail.subParser.forEach((s: string, index: number) => {
    dealSubPart(index, s, mail.isSubBase64, subs);
  });

  let from = mail.headers.get("from").value[0].address;
  const results: Dkim.VerifyResult[] = (await verifyDKIMContent(
    Buffer.from(email, "utf-8")
  )) as Dkim.VerifyResult[];
  if (from.split("@")[1] == "unipass.id") {
    Dkim.configKey(null);
  }
  return getDkimParams(
    results,
    subs.subs,
    subs.subIsBase64,
    subs.subjectPadding,
    from
  );
}

function dealSubPart(
  subPartIndex: number,
  subPart: string,
  subIsBase64: boolean[],
  ret: {
    subs: Buffer[];
    subsAllLen: number;
    subjectPadding: string;
    subIsBase64: boolean[];
  }
) {
  if (ret.subsAllLen >= 66) {
    return;
  }
  if (ret.subsAllLen === 0) {
    if (subIsBase64[subPartIndex]) {
      const decodedPart = Buffer.from(subPart, "base64").toString("utf8");
      const IndexOf0x = decodedPart.indexOf("0x");
      if (IndexOf0x > -1) {
        const remainder = (decodedPart.length - IndexOf0x) % 3;
        ret.subsAllLen = decodedPart.length - IndexOf0x;
        if (ret.subsAllLen > 66) {
          ret.subsAllLen = 66;
        }
        if (remainder === 1) {
          ret.subjectPadding = "0";
        } else if (remainder === 2) {
          ret.subjectPadding = "0x";
        }
        ret.subs.push(
          Buffer.from(
            subPart.slice(
              subPart.length -
                ((decodedPart.length - IndexOf0x - remainder) / 3) * 4,
              subPart.length -
                ((decodedPart.length - IndexOf0x - ret.subsAllLen) / 3) * 4
            ),
            "utf8"
          )
        );
        ret.subIsBase64.push(true);
      }
    } else {
      const IndexOf0x = subPart.indexOf("0x");
      if (IndexOf0x > -1) {
        ret.subsAllLen = subPart.length - IndexOf0x;
        if (ret.subsAllLen > 66) {
          ret.subsAllLen = 66;
        }
        ret.subs.push(
          Buffer.from(
            subPart.slice(IndexOf0x, IndexOf0x + ret.subsAllLen),
            "utf8"
          )
        );
        ret.subIsBase64.push(false);
      }
    }
  } else {
    if (subIsBase64[subPartIndex]) {
      const len = Math.min(66 - ret.subsAllLen, (subPart.length / 4) * 3);
      ret.subs.push(
        Buffer.from(subPart.slice(0, Math.ceil(len / 3) * 4), "utf8")
      );
      ret.subsAllLen += len;
      ret.subIsBase64.push(true);
    } else {
      const len = Math.min(66 - ret.subsAllLen, subPart.length);
      ret.subs.push(Buffer.from(subPart.slice(0, len), "utf8"));
      ret.subsAllLen += len;
      ret.subIsBase64.push(false);
    }
  }
}

export async function getEmailFromTx(tx: any) {
  if (tx.RegisterTx) {
    tx = tx.RegisterTx;

    const params = Buffer.from(tx.emailHeader.slice(2), "hex").toString();
    return [params];
  } else if (tx.QuickAddLocalKeyTx) {
    tx = tx.QuickAddLocalKeyTx;

    const params = [];
    for (let email of tx.emailHeaders) {
      const decoded = Buffer.from(email.slice(2), "hex").toString();
      params.push(decoded);
    }

    return params;
  } else if (tx.StartRecoveryTx) {
    tx = tx.StartRecoveryTx;

    const params = [];
    for (let email of tx.emailHeaders) {
      const decoded = Buffer.from(email.slice(2), "hex").toString();
      params.push(decoded);
    }

    return params;
  } else {
    return [];
  }
}
