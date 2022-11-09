import DKIM from "nodemailer/lib/dkim";
import { sha256 } from "ethereumjs-util";
import MailComposer from "nodemailer/lib/mail-composer";
import * as Dkim from "dkim";
import { arrayify, hexlify, solidityPack, toUtf8Bytes } from "ethers/lib/utils";
const mailParser = require("mailparser");

export interface DkimParams {
  emailHeader: string;
  dkimSig: string;
  fromIndex: number;
  fromLeftIndex: number;
  fromRightIndex: number;
  subjectIndex: number;
  subjectRightIndex: number;
  dkimHeaderIndex: number;
  sdidIndex: number;
  sdidRightIndex: number;
  selectorIndex: number;
  selectorRightIndex: number;
}

export enum EmailType {
  None,
  UpdateKeysetHash,
  LockKeysetHash,
  CancelLockKeysetHash,
  UpdateTimeLockDuring,
  UpdateImplementation,
  SyncAccount,
  CallOtherContract,
}

/**
 * @param params Solidity Dkim Validating Params
 * @returns Params Serializing String
 */
export function SerializeDkimParams(params: DkimParams, emailType: EmailType): string {
  let sig = solidityPack(
    ["uint32", "uint32", "uint32", "uint32", "uint32", "uint32", "uint32", "uint32", "uint32", "uint32", "uint32"],
    [
      emailType,
      params.subjectIndex,
      params.subjectRightIndex,
      params.fromIndex,
      params.fromLeftIndex,
      params.fromRightIndex,
      params.dkimHeaderIndex,
      params.selectorIndex,
      params.selectorRightIndex,
      params.sdidIndex,
      params.sdidRightIndex,
    ]
  );
  sig = solidityPack(["bytes", "uint32", "bytes"], [sig, params.emailHeader.length / 2 - 1, params.emailHeader]);

  sig = solidityPack(["bytes", "uint32", "bytes"], [sig, params.dkimSig.length / 2 - 1, params.dkimSig]);

  return sig;
}

export async function getSignEmailWithDkim(subject: string, from: string, to: string, unipassPrivateKey: string) {
  const mail = new MailComposer({
    from,
    to,
    subject,
    html: "<b>UniPass Test</b>",
  });

  const dkim = new DKIM({
    keySelector: "s2055",
    domainName: "unipass.com",
    privateKey: unipassPrivateKey,
  });
  const email = await signEmailWithDkim(mail, dkim);
  return email;
}

export async function signEmailWithDkim(mail: MailComposer, dkim: DKIM) {
  const msg = await mail.compile().build();
  const signedMsg = dkim.sign(msg);
  let buff = "";
  for await (const chunk of signedMsg) {
    buff += chunk;
  }

  return buff;
}

export function emailHash(emailAddress: string, pepper: string): string {
  if (!emailAddress) return "";
  emailAddress = emailAddress.toLowerCase();
  const split = emailAddress.split("@", 2);

  if (
    split[1] == "gmail.com" ||
    split[1] == "googlemail.com" ||
    split[1] == "protonmail.com" ||
    split[1] == "ptoton.me" ||
    split[1] == "pm.me"
  ) {
    emailAddress = Buffer.concat([Buffer.from(split[0].replace(".", "")), Buffer.from("@"), Buffer.from(split[1])]).toString(
      "utf8"
    );
  }

  return pureEmailHash(emailAddress, pepper);
}

export function pureEmailHash(emailAddress: string, pepper: string): string {
  if (!emailAddress) return "";

  return hexlify(sha256(Buffer.from(arrayify(solidityPack(["bytes", "bytes32"], [toUtf8Bytes(emailAddress), pepper])))));
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

export function getDkimParams(results: Dkim.VerifyResult[], fromHeader: string): DkimParams {
  for (const result of results) {
    const processedHeader = Buffer.from(toUtf8Bytes(result.processedHeader));
    const fromIndex = processedHeader.indexOf("from:");
    const fromEndIndex = processedHeader.indexOf("\r\n", fromIndex);

    let fromLeftIndex = processedHeader.indexOf("<" + fromHeader + ">", fromIndex);
    if (fromLeftIndex === -1 || fromLeftIndex > fromEndIndex) {
      fromLeftIndex = processedHeader.indexOf(fromHeader);
    } else {
      fromLeftIndex += 1;
    }
    const fromRightIndex = fromLeftIndex + fromHeader.length - 1;

    const signature = result.signature as any as Signature;
    if (signature.domain === "1e100.net") {
      continue;
    }

    const subjectIndex = processedHeader.indexOf("subject:");
    const dkimHeaderIndex = processedHeader.indexOf("dkim-signature:");
    const sdidIndex = processedHeader.indexOf(signature.domain, processedHeader.indexOf("d=", dkimHeaderIndex));
    const sdidRightIndex = sdidIndex + signature.domain.length;
    const selectorIndex = processedHeader.indexOf(signature.selector, processedHeader.indexOf("s=", dkimHeaderIndex));
    const selectorRightIndex = selectorIndex + signature.selector.length;
    const params = {
      emailHeader: hexlify(processedHeader),
      dkimSig: "0x" + signature.signature.toString("hex"),
      fromIndex,
      fromLeftIndex,
      fromRightIndex,
      subjectIndex,
      subjectRightIndex: processedHeader.indexOf("\r\n", subjectIndex),
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

export interface EmailParams {
  params: DkimParams;
  from: string;
}

export async function parseDkimResult(email: string): Promise<
  [
    {
      subs: any[];
      subsAllLen: number;
      subjectPadding: string;
      subIsBase64: any[];
    },
    string,
    Dkim.VerifyResult[]
  ]
> {
  const mail = await mailParser.simpleParser(email, {
    subjectSep: " ",
    isSepBase64: true,
  });

  const subs = {
    subs: [],
    subsAllLen: 0,
    subjectPadding: "",
    subIsBase64: [],
  };
  mail.subParser.forEach((s: string, index: number) => {
    dealSubPart(index, s, mail.isSubBase64, subs);
  });

  const from: string = mail.headers.get("from").value[0].address;
  const results: Dkim.VerifyResult[] = (await verifyDKIMContent(Buffer.from(email, "utf-8"))) as Dkim.VerifyResult[];
  if (from.split("@")[1] === "unipass.id") {
    Dkim.configKey(null);
  }
  return [subs, from, results];
}

export async function parseEmailParams(email: string): Promise<EmailParams> {
  const [subs, from, results] = await parseDkimResult(email);
  const params = getDkimParams(results, from);
  return { params, from };
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
              subPart.length - ((decodedPart.length - IndexOf0x - remainder) / 3) * 4,
              subPart.length - ((decodedPart.length - IndexOf0x - ret.subsAllLen) / 3) * 4
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
        ret.subs.push(Buffer.from(subPart.slice(IndexOf0x, IndexOf0x + ret.subsAllLen), "utf8"));
        ret.subIsBase64.push(false);
      }
    }
  } else {
    if (subIsBase64[subPartIndex]) {
      const len = Math.min(66 - ret.subsAllLen, (subPart.length / 4) * 3);
      ret.subs.push(Buffer.from(subPart.slice(0, Math.ceil(len / 3) * 4), "utf8"));
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
    for (const email of tx.emailHeaders) {
      const decoded = Buffer.from(email.slice(2), "hex").toString();
      params.push(decoded);
    }

    return params;
  } else if (tx.StartRecoveryTx) {
    tx = tx.StartRecoveryTx;

    const params = [];
    for (const email of tx.emailHeaders) {
      const decoded = Buffer.from(email.slice(2), "hex").toString();
      params.push(decoded);
    }

    return params;
  } else {
    return [];
  }
}
