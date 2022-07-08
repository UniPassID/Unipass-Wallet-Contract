import { ethers } from "hardhat";

export enum HookActionType {
  AddHook = 0,
  RemoveHook = 1,
}

export function generateAddHook(
  selector: string,
  implementation: string
): string {
  return ethers.utils.solidityPack(
    ["bytes4", "address"],
    [selector, implementation]
  );
}

export function generateRemoveHook(selector: string): string {
  return ethers.utils.solidityPack(["bytes4"], [selector]);
}

export function generateHookTx(
  actionType: HookActionType,
  selector: string,
  implementation: string | undefined
): string {
  switch (actionType) {
    case HookActionType.AddHook: {
      if (implementation == undefined) {
        throw "Expected implement";
      } else {
        return ethers.utils.solidityPack(
          ["uint8", "bytes"],
          [actionType, generateAddHook(selector, implementation)]
        );
      }
    }
    case HookActionType.RemoveHook: {
      return ethers.utils.solidityPack(
        ["uint8", "bytes"],
        [actionType, generateRemoveHook(selector)]
      );
    }
    default: {
      throw "Invalid action type";
    }
  }
}
