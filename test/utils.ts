import * as Dkim from "dkim";
const mailParser = require("mailparser");

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
  selectorIndex: number;
  selectorRightIndex: number;
}

export function throwError(msg: string) {
  throw msg;
}

export async function parseEmailParams(
  email: string,
  removeProtomail: boolean = true
): Promise<DkimParams | null> {
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
  const domain = from.split("@")[1];
  if (removeProtomail && domain == "protonmail.com") {
    return null;
  }

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
