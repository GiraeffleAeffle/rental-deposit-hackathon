# Solana native operations

The [service setup and HTTP contract](../app/api/finance/solana/README.md) is the canonical operator guide. It covers the test deployment manifest, exact-message wallet signing, sponsor fee/rent limits and recovery of persisted operations.

The application exposes those controls in **Connections → Connected Solana escrow** after authenticated account access. A real accepted agreement, original-wallet recovery and matching initialized test escrow are required. Localnet has no Privy browser-signing claim. The native [Anchor/Kamino execution proof](../programs/rental_escrow/README.md) is independent of provider setup.

No mainnet escrow writes or issuer test-network trades are enabled. A read-only mainnet Jupiter quote is pricing evidence, not a deployed devnet investment route.
