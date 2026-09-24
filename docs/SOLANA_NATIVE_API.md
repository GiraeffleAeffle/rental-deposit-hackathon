# Solana native operations

The [service setup and HTTP contract](../app/api/finance/solana/README.md) is the canonical operator guide. It covers the test deployment manifest, exact-message wallet signing, sponsor fee/rent limits and recovery of persisted operations.

The application exposes those controls in **Connections → Connected Solana escrow** after authenticated account access. A real accepted agreement, original-wallet recovery and matching initialized test escrow are required. Localnet has no Privy browser-signing claim. The native [Anchor/Kamino execution proof](../programs/rental_escrow/README.md) is independent of provider setup.

An [operator-key devnet rehearsal](SOLANA_DEVNET_REHEARSAL.md) deployed the original test program and completed a 10-test-USDC custody cycle through Kamino. Its test tenancy does not match a Privy agreement or wallet. Separately, one Privy-connected joint-signature tenancy finalized funding and supply and remains active. Another on the staged program completed setup, funding, supply, redemption, zero-claim acceptance and full tenant payout. Independent finalized reads found closed escrow with zero cash/receipts, 10 test USDC at the tenant's fixed payout account and zero at the landlord's.

No mainnet escrow writes or issuer test-network trades are enabled. A read-only mainnet Jupiter quote is pricing evidence, not a deployed devnet investment route.
