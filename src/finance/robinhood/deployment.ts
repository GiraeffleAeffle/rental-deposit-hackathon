import { keccak256, type Hex } from 'viem';

// solc 0.8.28, optimizer 200, Cancun; contracts/evm/src/RentalEscrow.sol.
// Rebuild and review this fingerprint when Solidity or compiler settings change.
export const rentalEscrowRuntime = {
  length: 14770,
  normalizedHash: '0x429b4a939efdb1fb0aa47166b8afd4429f11e05b608b616d960045eabe14c1a7' as Hex,
  immutableOffsets: [
    593, 689, 753, 792, 988, 1055, 1122, 1207, 1329, 1396, 1477, 1690, 1788, 2084, 2252, 2386, 2616,
    2859, 2993, 3027, 3090, 3250, 3284, 3446, 3614, 3808, 3977, 5236, 5458, 5590, 5740, 5774, 5934,
    5968, 6007, 6080, 6225, 6364, 6539, 6778, 6813, 6904, 7124, 7159, 7221, 7256, 7478, 7856, 8089,
    8123, 8156, 8209, 8353, 8611, 8771, 8805, 8892, 9067, 9353, 9424, 9578, 9697, 9826, 9937, 10343,
  ],
} as const;

/** Both the reviewed program and this deployment's exact immutable values must match. */
export function assertRentalEscrowRuntime(code: Hex, expectedDeploymentHash: Hex): void {
  if (
    !/^0x[0-9a-fA-F]+$/.test(code) ||
    code.length !== rentalEscrowRuntime.length * 2 + 2 ||
    keccak256(code).toLowerCase() !== expectedDeploymentHash.toLowerCase()
  ) {
    throw new Error('Escrow deployment code does not match the reviewed hash');
  }
  let normalized = code.slice(2);
  for (const start of rentalEscrowRuntime.immutableOffsets) {
    normalized =
      normalized.slice(0, start * 2) + '0'.repeat(64) + normalized.slice((start + 32) * 2);
  }
  if (keccak256(`0x${normalized}`) !== rentalEscrowRuntime.normalizedHash) {
    throw new Error('Escrow is not the compiled restricted RentalEscrow program');
  }
}
