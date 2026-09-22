import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { keccak256 } from 'viem';
import {
  assertRentalEscrowRuntime,
  rentalEscrowRuntime,
} from '../../../src/finance/robinhood/deployment.ts';

const path = fileURLToPath(new URL('../out/RentalEscrow.sol/RentalEscrow.json', import.meta.url));
const artifact = JSON.parse(readFileSync(path, 'utf8'));
const code = artifact.deployedBytecode.object;
const references = Object.values(artifact.deployedBytecode.immutableReferences)
  .flat()
  .sort((a, b) => a.start - b.start);
assert.deepEqual(
  references.map((reference) => reference.start),
  [...rentalEscrowRuntime.immutableOffsets],
);
assert.ok(references.every((reference) => reference.length === 32));
assertRentalEscrowRuntime(code, keccak256(code));
const first = rentalEscrowRuntime.immutableOffsets[0] * 2 + 2;
const configured = code.slice(0, first) + '1'.repeat(64) + code.slice(first + 64);
assertRentalEscrowRuntime(configured, keccak256(configured));
assert.throws(() => assertRentalEscrowRuntime(configured, keccak256(code)));
const modified = `0x00${configured.slice(4)}`;
assert.throws(() => assertRentalEscrowRuntime(modified, keccak256(modified)));
console.log(
  'Compiled runtime, immutable normalization, exact deployment binding and mutation rejection passed.',
);
