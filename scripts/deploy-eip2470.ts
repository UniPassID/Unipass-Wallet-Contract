import { ethers } from "hardhat";
import { Transaction } from "ethereumjs-tx";
import { expect } from "chai";

export async function deployEip2470() {
  const wallet = (await ethers.getSigners())[0];

  console.log("Start Deploying EIP2470 Transaction");
  console.log("");
  console.log(`Deploying Network: ${ethers.getDefaultProvider().network.name}`);
  console.log(`Deployer Address: ${wallet.address}`);
  console.log(
    `Deployer Balance: ${ethers.utils.formatEther(await wallet.getBalance())}`
  );

  let provider;
  if (wallet.provider === undefined) {
    throw new Error("expected provider");
  } else {
    provider = wallet.provider;
  }

  const code = await provider.getCode(
    "0xce0042b868300000d44a59004da54a005ffdcf9f"
  );
  if (code === "" || code === "0x") {
    console.log("Deploy Success: 0xce0042b868300000d44a59004da54a005ffdcf9f");
    return;
  }

  let ret;
  const balance = await provider.getBalance(
    "0xBb6e024b9cFFACB947A71991E386681B1Cd1477D"
  );
  if (balance < ethers.utils.parseEther("0.0247")) {
    const value = ethers.utils.parseEther("0.0247").sub(balance);
    ret = await (
      await wallet.sendTransaction({
        value,
        to: "0xBb6e024b9cFFACB947A71991E386681B1Cd1477D",
      })
    ).wait();
    expect(ret.status).to.equals(1);
  }

  const tx = new Transaction({
    nonce: 0,
    gasPrice: 100000000000,
    value: 0,
    data: "0x608060405234801561001057600080fd5b50610134806100206000396000f3fe6080604052348015600f57600080fd5b506004361060285760003560e01c80634af63f0214602d575b600080fd5b60cf60048036036040811015604157600080fd5b810190602081018135640100000000811115605b57600080fd5b820183602082011115606c57600080fd5b80359060200191846001830284011164010000000083111715608d57600080fd5b91908080601f016020809104026020016040519081016040528093929190818152602001838380828437600092019190915250929550509135925060eb915050565b604080516001600160a01b039092168252519081900360200190f35b6000818351602085016000f5939250505056fea26469706673582212206b44f8a82cb6b156bfcc3dc6aadd6df4eefd204bc928a4397fd15dacf6d5320564736f6c63430006020033",
    gasLimit: 247000,
    v: 27,
    r: "0x247000",
    s: "0x2470",
  });
  ret = await (
    await provider.sendTransaction(`0x${tx.serialize().toString("hex")}`)
  ).wait();
  expect(ret.status).to.equals(1);
  console.log("Deploy Success");
}

deployEip2470().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
