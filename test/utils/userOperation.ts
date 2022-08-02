import { BigNumber, BytesLike, constants } from "ethers";

export interface UserOperation {
  sender: BytesLike;
  nonce: number;
  initCode: BytesLike;
  callData: BytesLike;
  callGas: BigNumber;
  maxFeePerGas: BigNumber;
  maxPriorityFeePerGas: BigNumber;
  verificationGas: BigNumber;
  preVerificationGas: BigNumber;
  paymaster: BytesLike;
  paymasterData: BytesLike;
  signature: BytesLike;
}

export const DefaultsForUserOp: UserOperation = {
  sender: constants.AddressZero,
  nonce: 0,
  initCode: "0x",
  callData: "0x",
  callGas: constants.Zero,
  verificationGas: BigNumber.from(100000), // default verification gas. will add create2 cost (3200+200*length) if initCode exists
  preVerificationGas: BigNumber.from(21000), // should also cover calldata cost.
  maxFeePerGas: constants.Zero,
  maxPriorityFeePerGas: BigNumber.from(1e9),
  paymaster: constants.AddressZero,
  paymasterData: "0x",
  signature: "0x",
};
