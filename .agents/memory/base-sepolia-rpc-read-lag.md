---
name: Base Sepolia public RPC read lag
description: Reads right after writes against the public Base Sepolia RPC can be stale; retry.
---

When using the public Base Sepolia RPC (`https://sepolia.base.org`), a contract
read issued immediately after a confirmed write can return stale or zero state,
even though `waitForTransactionReceipt` resolved successfully.

**Symptom observed:** after registering an agent in an IdentityRegistry, reading
`agentId(address)` for the just-registered address returned `0` while the value
was actually set on-chain (a later read returned the correct id). This silently
wrote a wrong `agentId` into the deployment file.

**Why:** the public endpoint is load-balanced across nodes; the node serving the
read may lag the node that included the write.

**How to apply:** after a write, retry read-backs of the new state a few times
with a short delay before trusting a zero/empty result. Also check
`receipt.status === "success"` on writes — `waitForTransactionReceipt` resolves
for reverted txs too.
