import { Contract, ethers } from "ethers";
import { CallType } from "./sigPart";

export function generateAddHookTx(
  contract: Contract,
  selector: string,
  implementation: string
) {
  const data = contract.interface.encodeFunctionData("addHook", [
    selector,
    implementation,
  ]);
  let tx = {
    callType: CallType.Call,
    gasLimit: ethers.constants.Zero,
    revertOnError: true,
    target: contract.address,
    value: ethers.constants.Zero,
    data,
  };
  return tx;
}

export function generateRemoveHookTx(contract: Contract, selector: string) {
  const data = contract.interface.encodeFunctionData("removeHook", [selector]);
  let tx = {
    callType: CallType.Call,
    revertOnError: true,
    gasLimit: ethers.constants.Zero,
    target: contract.address,
    value: ethers.constants.Zero,
    data,
  };
  return tx;
}
