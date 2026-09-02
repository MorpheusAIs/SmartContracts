# 8-add-base-as-l2

## What we're doing

Right now the capital protocol has exactly one L2 network — Arbitrum: that's where MOR gets minted
on reward claim, and that's where accumulated yield (wstETH) gets transferred. This deployment adds
**Base** as a second, optional network for both flows, with Arbitrum staying the default.

At the same time, the MOR-mint messaging channel is fully migrated from LayerZero V1 to V2 — not
just for Base, but for Arbitrum too (the old V1 receiver on Arbitrum isn't upgraded, it's replaced
by a new one; the old one simply stops being a minter once the new path is verified).

Two independent flows:

- **Flow A — MOR minting on claim.** The user can specify a destination network when claiming
  (Arbitrum by default). Delivery is a LayerZero V2 message to a new receiver contract (one per
  network) that mints MOR.
- **Flow B — yield transfer (wstETH).** The protocol owner can choose a destination network when
  withdrawing accumulated yield from Ethereum. Delivery goes through each network's bridge for this
  specific token (Arbitrum — unchanged, retryable tickets as before; Base — new, Lido's own bridge,
  not the generic OP Stack one) to a receiver contract that can optionally swap the token via
  Uniswap V3.

## Roles

The upgrade touches three independent networks and needs coordination between several parties. No
role has another's permissions:

- **Deployer** — a plain EOA. Deploys new contracts, calls the permissionless setup on them (the
  parts that don't need owner privileges), and hands ownership to the right admin at the end of
  each step. Never stays the owner of anything after deploying.
- **Multisig owner of the existing Ethereum contracts** — already owns `L1Sender`, `Distributor`,
  and every `DepositPool`. The only one who can upgrade and configure them. Doesn't own, and has no
  say over, the new Base/Arbitrum contracts.
- **Arbitrum admin** — already owns MOR minting on that network (same address as before). After
  deployment also becomes the owner of the new message receiver there.
- **Base admin** — same idea, owns MOR minting on Base and becomes the owner of the new Base
  contracts (message receiver and yield receiver).

## Scope: what gets deployed, what gets upgraded

| Contract | Network | Change type | Flow |
|---|---|---|---|
| `L2MessageReceiverV2` | Arbitrum | New deploy | A |
| `L2MessageReceiverV2` | Base | New deploy | A |
| `L2TokenReceiverV3` | Base | New deploy | B |
| `L1Sender` → `L1SenderV3` | Ethereum | Upgrade existing proxy | A + B |
| `Distributor` → `DistributorV3` | Ethereum | Upgrade existing proxy | A |
| `DepositPool` (×5: stETH/wETH/wBTC/USDC/USDT) → `DepositPoolV8` | Ethereum | Upgrade existing proxy | A |
| `MOROFT` | Arbitrum, Base | Not deployed or upgraded — config only (`updateMinter`) | A |
| `L2MessageReceiver` (V1) | Arbitrum | Left alone — just loses minting rights (step 4) | A |
| `L2TokenReceiverV2` | Arbitrum | Left alone entirely, stays as-is | B |

Total: **3 new contracts** (2 on Arbitrum/Base for Flow A, 1 on Base for Flow B) and **3 upgrades**
of existing Ethereum proxies (one of which, `L1Sender`, serves both flows at once).

## Stages

This is a high-level description — what gets called and why. A detailed step-by-step guide (command
order, who signs what, what to check between steps) will show up separately if/when needed. Exact
call parameters, addresses, and the current code live in the migration files in this same folder.

### 1. Arbitrum — new MOR-message receiver (Flow A)

**Deployer:**
- Deploys `L2MessageReceiverV2` (non-upgradeable, a separate contract from the old one, not an
  upgrade of it).
- `setPeer()` — tells the receiver to only accept messages from Ethereum's `L1Sender`; otherwise
  anyone could mint by pretending to be the sender.
- `transferOwnership()` — hands the contract to the Arbitrum admin, the deployer ends up owning
  nothing.

**Arbitrum admin:**
- `MOROFT.updateMinter(newReceiver, true)` — grants the new receiver minting rights. The old (V1)
  minter's rights are **not** revoked by this same call — both minters stay active in parallel, no
  downtime window.

### 2. Base — new MOR-message receiver (Flow A)

Same as step 1, just on Base: deploy `L2MessageReceiverV2`, `setPeer()`, `transferOwnership()`, then
`MOROFT.updateMinter(newReceiver, true)`. Nothing to revoke here — MOR was never minted on Base
through this path before.

### 3. Ethereum — upgrade the core contracts (Flow A)

**Deployer:**
- Deploys the new implementations `L1SenderV3`, `DistributorV3`, `DepositPoolV8` — just code, has no
  effect on the live system until the proxies are actually switched over.

**Multisig** — strictly in this order (matches `3_mainnet.ts`'s `_step2`, not the reverse):
otherwise claiming temporarily breaks, see the explanation in the migration file itself. Must ship
as **one atomic Safe batch** (Transaction Builder / `MultiSendCallOnly`), not as separate sequential
Safe transactions — between `upgradeTo(V3)` and `setLzV2Config`, every `claim()` reverts, and that
window is real downtime if the calls land as separate transactions instead of one bundle.
- `L1Sender.upgradeTo(...)` — points the proxy at the new implementation.
- `L1Sender.setLzEndpointV2()` — sets the LayerZero V2 endpoint address on Ethereum.
- `L1Sender.setLzDelegate()` — sets the delegate on the LZ endpoint (call once, right after
  `setLzEndpointV2`).
- `L1Sender.setLzV2Config()` × 2 (Arbitrum, Base) — exactly where to send the LZ message on each
  network (receiver addresses from steps 1-2). Must run **before** `setDefaultChainId` — that setter
  now requires a config to already exist for the chain id it's pointed at.
- `L1Sender.setDefaultChainId()` — which network is used when the user doesn't specify one
  explicitly (Arbitrum).
- `Distributor.upgradeTo(...)`.
- `DepositPool.upgradeTo(...)` × 5 — one per pool (stETH/wETH/wBTC/USDC/USDT).

### 4. Arbitrum — revoke the old minter (Flow A, final)

Only done **after** manually verifying that a real claim with an explicit network choice actually
lands and mints MOR on both networks.

**Arbitrum admin:**
- `MOROFT.updateMinter(oldReceiver, false)` — revokes the old (V1) receiver's minting rights.
  Reversible (the same call with `true` restores it), but only worth doing after real verification
  that the new path actually works — otherwise you could end up with no working minter at all.

### 5. Base — yield receiver (Flow B)

**Deployer:**
- Deploys `L2TokenReceiverV3` (upgradeable, with Uniswap V3 integration via `SwapRouter02` — because
  the original `SwapRouter`, which the Arbitrum version uses, simply doesn't exist on Base).
- `L2TokenReceiver__init()` — sets the router, the position manager, and one of the two swap legs
  (WETH → MOR).
- `editParams()` — sets the second swap leg (wstETH → WETH); a separate call, because init doesn't
  cover it (inherited from the Arbitrum version).
- `transferOwnership()` — hands the contract to the Base admin.

### 6. Ethereum — wire up the Base bridge (Flow B)

**Multisig:**
- `L1Sender.setBaseBridgeConfig()` — sets the bridge address and the Base receiver address (from
  step 5) that `sendWstETHToBase()` then uses. Run after step 3 — `L1Sender` needs to already be on
  the new version, otherwise this function doesn't exist yet.

Before relying on this in production: first test-transfer a small amount of wstETH and confirm it
actually reaches the receiver on Base.

## Nuances and constraints

- **`chainId_` (in `claim`, `sendMintMessage`, `setLzV2Config`, `setDefaultChainId`) is the real EVM
  chain id — `42161` for Arbitrum, `8453` for Base — never the LayerZero endpoint id.** Callers
  (including the frontend) only ever deal in real chain ids. `L1SenderV3` resolves the LZ eid
  internally: `LayerZeroV2Config` now carries its own `eid` field, keyed in `lzV2Configs` by chain
  id, and `_sendMintMessage` reads `lzV2Configs[chainId_].eid` when calling the LayerZero endpoint.
  `setLzV2Config` requires both `chainId_` and `config_.eid` to be non-zero.
- **Why `L2MessageReceiverV2` is a new contract instead of an upgrade of the old one.** The old
  `L2MessageReceiver` on Arbitrum is `UUPSUpgradeable` — upgrading it is technically possible. But
  the LayerZero V2 OApp contracts (which the new receiver is built on) use their own,
  non-upgradeable ownership model: plain `Ownable`, not `OwnableUpgradeable`. Inheriting that into an
  already-existing UUPS proxy would mean two different ownership mechanisms with their own storage
  in one contract at once — a real risk of slot collision on upgrade. For a receiver that barely
  holds any meaningful state to begin with (a token address and trusted peers), dealing with that is
  overkill — easier to just deploy a new one and switch the minter.
- **Why `L1Sender` does NOT inherit the LayerZero V2 OApp contracts directly.** Same reason:
  `L1Sender` is an already-existing `OwnableUpgradeable` proxy that has to be upgraded regardless,
  but instead of inheriting `OAppSender`/`OAppCore` it, as before, just calls the LayerZero endpoint
  interface directly (`ILayerZeroEndpointV2.send()`) — the same pattern that was already there, just
  V2 instead of V1 under the hood. `OwnableUpgradeable`/UUPS storage is untouched by any of this.
- **`msg.value` is still simply forwarded through, it doesn't need to match `quote()` exactly.**
  `L1SenderV3` calls `EndpointV2.send()` directly (not through `OAppSender`, which would require an
  exact match) — the endpoint itself just checks that `msg.value` is at least the real fee, and
  refunds the excess to `refundTo_`. So overpaying is safe; underpaying reverts. The frontend should
  still call `quote()` before `claim()` to know at least the lower bound.
- **Why Base uses `SwapRouter02` instead of the original `SwapRouter`.** The Arbitrum version of the
  yield receiver (`L2TokenReceiverV2`) is built on the original Uniswap `ISwapRouter` (with a
  `deadline` field in the swap params). That contract doesn't exist on Base at all — Uniswap only
  deployed `SwapRouter02` there (no `deadline`, different ABI, different function selector) and
  `UniversalRouter`. So `L2TokenReceiverV3` is a separate contract for a different ABI, not a
  parameterized version of the old one. Deadline protection isn't lost — since the router no longer
  checks it itself, `L2TokenReceiverV3` now checks it itself before calling the swap.
- **Arbitrum deliberately stays on `L2TokenReceiverV2`/the original `SwapRouter`, doesn't move to
  V3.** The working path on Arbitrum is left alone. ⚠️ If we ever do decide to switch Arbitrum to the
  V3 logic later — a plain `upgradeTo` on the existing proxy would break it: the `router` address
  stays the old one (the original `SwapRouter`'s address) after the upgrade, while the new code
  expects `SwapRouter02`'s ABI at that address. There's currently no setter for `router` in the
  contract (it's set once, in `init`). Two options for later: add `setRouter()` and upgrade the
  existing proxy, or just deploy a fresh `L2TokenReceiverV3` on Arbitrum (same pattern we already use
  for the message receiver) — then `router` points at `SwapRouter02` from `init` right away, no
  upgrade and no new setter needed.
- **The wstETH bridge to Base is Lido's own bridge, not the generic OP Stack `L1StandardBridge`.**
  Base's bridged wstETH is only mintable by Lido's own `L2ERC20TokenBridge` — confirmed on-chain via
  the token's own `bridge()` getter, which points at Lido's bridge, not the generic
  `L2StandardBridge`. Depositing through the generic `L1StandardBridge` would escrow the wstETH on L1
  successfully and then fail to mint on L2 — the deposit would be stuck with no clean way back. The
  correct L1 contract is Lido's own "Base L1 ERC20 Token Bridge" (publicly tagged as such on
  Etherscan, and listed on Lido's own [deployed contracts
  docs](https://docs.lido.fi/deployed-contracts/)), method `depositERC20To`, not `bridgeERC20To`.
  The existence of both Uniswap V3 pools
  (wstETH/WETH, WETH/MOR) on Base that the yield receiver needs was also verified directly on-chain
  against the pool factory, not just from docs — both genuinely exist and have active liquidity at
  the same fee tiers as on Arbitrum.
- **`L2MessageReceiverV2` isn't upgradeable at all, by design.** A deliberate tradeoff. If the
  receiver's logic ever needs to change in the future, that's another fresh deploy + minter cutover,
  not an upgrade. Cheaper and safer for this task, but the next logic change will mean repeating the
  whole cutover process from scratch.

## Approximate cost for the deployer

Only the steps the deployer actually pays for (deploying contracts + permissionless setup). Computed
from actual gas usage (run on each network's fork) and each network's gas price at the time of
writing (2026-08-29) — **gas price moves, this is a snapshot for today, not a guarantee**.

| Network | Gas (deployer) | Gas price today | Total in native token |
|---|---|---|---|
| Ethereum (step 3, deploying implementations) | ~12,430,000 | ~0.057 Gwei | ~**0.0007 ETH** |
| Arbitrum (step 1) | ~840,600 | ~0.020 Gwei | ~**0.000017 ETH** |
| Base (steps 2 + 5) | ~3,118,000 | ~0.006 Gwei | ~**0.000019 ETH** |

All three networks combined come out well under 0.001 ETH at current gas prices. Ethereum accounts
for most of it, from deploying three fairly large implementations (`DepositPoolV8` is the heaviest,
~5.2M gas thanks to the referrer-tier and multiplier logic).
