# Robinhood adapter boundary

Only `viem` is required. Public amounts are decimal integer strings; conversions use `bigint`. These helpers do not import the application store or user interface.

```text
readEscrow(client, manifest, escrowAddress)
planEscrowCall(manifest, snapshot, intent, roleWallet, deadline)
simulateEscrowCall(client, nativePlan)
prepareSignedOperation(manifest, snapshot, intent, roleWallet, deadline)
encodeSignedOperation(preparedAction, signature)
reconcileReceipt(client, persistedPlan, submittedHash, confirmations)
quoteStockTrade(serverRouteConfig, serverVerifiedRequest)
```

`readEscrow` throws on failed/missing/mismatched observations; it never substitutes zero balances. Persist its block/hash/time alongside the observation. The default manifest describes existing lending/token dependencies, not a deployed rental escrow. Testnets and local fixtures must use their own manifest.

`prepareSignedOperation` reconstructs the exact EIP-712 schema described in `contracts/evm/README.md`. Serialize bigint message fields as decimal strings for APIs. Capture the user's signature in the wallet, simulate `encodeSignedOperation`'s exact call and let a separately funded sponsor submit it. `requiredSigner` is the role wallet, not the sponsor. A native wallet may instead submit the original call itself. Initial token approval remains a separate operation.

The durable application must own the submitted hash and confirmation state. Reconciliation checks exact transaction calldata and destination, canonical block, expected financial event, and escrow nonce. Relayed calls additionally require the contract's signer/digest event; direct calls require the transaction sender to match the role wallet. A reverted call is failed; unavailable or missing RPC evidence stays unresolved. A configured confirmation count is an operational threshold, not an assertion of Ethereum settlement finality. Safe4337 envelopes need a separate verifier and are not automatically accepted as direct calls.

The quote helper is server-only by design: do not pass API keys or eligibility decisions from the browser. Its default should have no API key, RWA disabled and no reviewed targets. `refreshBy` is our short refresh deadline, not an issuer guarantee of quote validity. Requote after an approval, simulate the actual wallet transaction, show all fees/minimum output and require explicit consent. No trade executor or fabricated provider account is included.

See `contracts/evm/README.md` for tested boundaries, reproducible proof and remaining access gates.
