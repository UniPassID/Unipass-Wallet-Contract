import { hexlify, keccak256, solidityPack, toUtf8Bytes } from "ethers/lib/utils";
import base64url from "base64url";
import { Contract, providers, Wallet } from "ethers";
import { ethers, network } from "hardhat";
import { expect } from "chai";

const provider = new providers.Web3Provider(network.provider.send);

async function main() {
  const contractFactory = await ethers.getContractFactory("OpenID");
  const openID = new Contract(
    "0x0E12aDcD52376614A14653f389801B7E25887aE5",
    contractFactory.interface,
    new Wallet(process.env.OPENID_ADMIN!, provider)
  );

  for (const { iss, kid, pubKey } of [
    {
      iss: "https://accounts.google.com",
      kid: "f451345fad08101bfb345cf642a2da9267b9ebeb",
      pubKey:
        "ppFPAZUqIVqCf_SffT6xDCXu1R7aRoT6TNT5_Q8PKxkkqbOVysJPNwliF-486VeM8KNW8onFOv0GkP0lJ2ASrVgyMG1qmlGUlKug64dMQXPxSlVUCXCPN676W5IZTvT0tD2byM_29HZXnOifRg-d7PRRvIBLSUWe-fGb1-tP2w65SOW-W6LuOjGzLNPJFYQvHyUx_uXHOCfIoSb8kaMwx8bCWvKc76yT0DG1wcygGXKuFQHW-Sdi1j_6bF19lVu30DX-jhYsNMUnGUr6g2iycQ50pWMORZqvcHVOH1bbDrWuz0b564sK0ET2B3XDR37djNQ305PxiQZaBStm-hM8Aw",
    },
    {
      iss: "https://dev-mn6rjgwhgyiuyy7d.us.auth0.com/",
      kid: "h3z2sfqPqMVBcJABJ3QQA",
      pubKey:
        "7qxWShENj3kTLXkVZN58K0h8UbaEG2cKZlzIFNqTtLrMBJCJE6Ivq0gMS0jGzflABQLuc9W53EMY5NfO5n9NDn_fsALoYdHdkvQOMwBr1v_Jp4jSua-uqFbMSBdTFqffVH3V_ClsQS3cptbpHwQ6xBL_Cbw3iJkA74tkt_N5Y8cncECISPgXi-J1hYjRVLcqaycFX6aiUChUHz6X1KBPybSQAonIYNr4291snkmL2wwo5L0NdToHAuOzEjkQM40UVU4Pjfkb7yes3q3DY_yyKM5eSGIQgunwxnrlqx-wrWhC-qrb_4gD8PgDkGWQtOaEez5H_JPTWbgnnMR440BOSw",
    },
  ]) {
    const key = keccak256(solidityPack(["bytes", "bytes"], [toUtf8Bytes(iss), toUtf8Bytes(kid)]));
    const n = base64url.toBuffer(pubKey);
    if ((await openID.callStatic.getOpenIDPublicKey(key)) !== hexlify(n)) {
      console.log("Updating OpenID Public Key");
      const ret = await (await openID.updateOpenIDPublidKey(key, n)).wait();
      expect(ret.status).to.equals(1);
      console.log("Updating OpenID Success");
    } else {
      console.log("OpenID Public Key Has Been Updated");
    }
  }
}

main();
