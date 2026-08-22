# Solana Payment Gateway

A non-custodial payment processing backend for Solana — accept SOL and USDC payments, get real-time confirmation, and receive signed webhooks the moment a customer pays. Built as a scoped-down version of the payments infrastructure a merchant would otherwise have to build in-house: reference-based order matching, on-chain transaction verification, and reliable webhook delivery with retries.

Unlike a traditional payment processor, this system **never custodies funds**. Money moves directly from customer wallet to merchant wallet on-chain; this backend only watches, verifies, and notifies.

---

## How it works

```
Merchant                  This API                    Solana                 Customer's wallet
   │                          │                          │                         │
   │  POST /payments          │                          │                         │
   ├─────────────────────────>│                          │                         │
   │                          │  generate reference      │                         │
   │                          │  build Solana Pay URL    │                         │
   │  <- solanaPayUrl         │                          │                         │
   │<─────────────────────────┤                          │                         │
   │                          │                          │                         │
   │  (show QR to customer)   │                          │                         │
   │──────────────────────────────────────────────────────────────────────────────>│
   │                          │                          │   customer approves     │
   │                          │                          │<────────────────────────┤
   │                          │ live tx detected         │                         │
   │                          │ (logsNotifications)      │                         │
   │                          │<─────────────────────────┤                         │
   │                          │  verify amount/token/    │                         │
   │                          │  recipient/reference     │                         │
   │                          │  mark payment "confirmed"│                         │
   │  <- signed webhook       │                          │                         │
   │<─────────────────────────┤                          │                         │
```

1. Merchant creates a payment request via the API.
2. The backend generates a one-time **reference key** (a disposable keypair used purely to tag the transaction — it never holds funds and never signs anything) and builds a [Solana Pay](https://docs.solanapay.com/) URL.
3. The merchant shows this as a QR code or link. The customer pays directly from their own wallet to the merchant's wallet, on-chain.
4. A live WebSocket subscription (`logsNotifications`) watches the merchant's payout wallet. The moment a matching transaction lands, it's parsed, verified against the expected amount/token/recipient/reference, and the payment is marked `confirmed`.
5. A signed webhook is delivered to the merchant's server, with automatic retry on failure.

---

## Why a reference key?

Solana transactions have no native concept of "orders." A transfer only knows sender, recipient, amount — nothing that says *which* payment request it belongs to. If a merchant has multiple pending payments for the same amount, there's no way to tell them apart from the transaction alone.

The fix: at creation time, this backend generates a fresh keypair and includes **only its public key** as a non-signing, non-writable account in the eventual transaction (part of the Solana Pay spec, not the base protocol). It's a disposable tag, not a wallet — used purely so the watcher can find and match the exact payment a transaction belongs to.

---

## Detection: live watcher + reconciliation sweep

Real-time detection alone isn't enough — a WebSocket subscription only catches events that happen *while it's connected*. If the server restarts or a connection drops, anything that happened during that gap would be missed. This system uses two complementary mechanisms:

- **Live subscription (`logsNotifications`)** — one WebSocket subscription per merchant, filtered to their `payoutWallet`. Fires in real time the moment a matching transaction lands. Managed via `AbortController` — each merchant's subscription can be cleanly cancelled without affecting others.
- **Reconciliation sweep** — runs once whenever a merchant's subscription is (re)established: at server boot, and whenever a merchant creates their first pending payment while unwatched. It queries the 50 most recent transactions against the merchant's wallet and checks each one against currently pending payments — catching anything that happened while nothing was listening.

Both paths converge on the same verification logic (`verifyTransaction`) and the same confirmation/webhook logic (`confirmAndNotify`), so a live-detected payment and a reconciled one are verified identically — no duplicated, divergent logic between the two.

The watcher also auto-reconnects on unexpected crashes: if the `for await` loop on a subscription throws due to a network error, it detects that the abort was not intentional (via `controller.signal.aborted`) and restarts `connectMerchant` automatically.

This was tested directly: a payment created, paid *while the server was offline*, and correctly picked up and confirmed by the reconciliation sweep on restart — with the webhook still firing correctly.

---

## Security model

- **API key + secret**, not sessions. This is a developer-facing API — merchants integrate from their own backend, not a browser — so there's no login flow. The API secret is the credential; it's shown once, at registration, and never stored or transmitted in raw form again (only its bcrypt hash is persisted).
- **Credential rotation with a grace window.** Rotating keys doesn't require flipping a switch and hoping every server picks up the new key instantly — the previous credential set remains valid for 24 hours after rotation, then automatically stops working. (v2 supports exactly one grace-window credential set at a time; a second rotation within an active window immediately invalidates the first.)
- **Webhook secrets are encrypted, not hashed.** This is a deliberate distinction from the API secret: an API secret only ever needs to be *compared against*, so a one-way bcrypt hash is correct and sufficient. A webhook secret needs to be *reused* every time a webhook is signed — so it's encrypted with AES-256-GCM instead, using a master key held outside the database (env var in this version; intended for a proper KMS in production), with the IV and auth tag stored alongside the ciphertext.
- **Webhook payloads are HMAC-signed** (SHA-256) using each merchant's own webhook secret, sent as an `x-webhook-signature` header.

---

## Verifying webhooks (read this before integrating)

Every webhook delivery includes an `x-webhook-signature` header — an HMAC-SHA256 of the exact request body, using the webhook secret you were given at registration.

**Important:** verify the signature against the **raw request body bytes**, not a re-serialized version of the parsed JSON. If you `JSON.parse()` the body and then `JSON.stringify()` it again before hashing, there's no guarantee the resulting string matches byte-for-byte what was originally signed (key ordering, whitespace, and serialization differences between JSON libraries can all change the output) — and the signatures won't match even though the data is identical. Most HTTP frameworks expose the raw, unparsed body specifically for this reason (e.g. Express's `express.raw()`).

```js
const crypto = require("crypto");

function verifyWebhook(rawBody, signatureHeader, webhookSecret) {
    const expected = crypto
        .createHmac("sha256", webhookSecret)
        .update(rawBody) // raw string/buffer, not a re-parsed object
        .digest("hex");

    return crypto.timingSafeEqual(
        Buffer.from(expected),
        Buffer.from(signatureHeader)
    );
}
```

### Webhook payload

```json
{
  "event": "payment.confirmed",
  "data": {
    "paymentId": "...",
    "reference": "...",
    "amount": 0.05,
    "currency": "SOL",
    "transactionSignature": "...",
    "payerWallet": "...",
    "confirmedAt": "2026-07-30T10:40:35.607Z"
  }
}
```

Delivery retries on failure with exponential backoff (1m → 5m → 30m → 2h), then stops.

---

## API Reference

Base path: `/api/v1`

All payment endpoints require these headers:
```
x-api-key: <your api key>
x-api-secret: <your api secret>
```

### Auth

**`POST /auth/register`**
```json
{
  "email": "merchant@example.com",
  "webhookUrl": "https://your-server.com/webhooks/solana",
  "payoutWallet": "<your Solana wallet address>"
}
```
Returns `apiKey`, `apiSecret`, and `webhookSecret` — **shown once**, store them immediately. `webhookUrl` must be `https://`.

**`POST /auth/rotate`** *(requires current credentials)*
Issues a new `apiKey`/`apiSecret` pair. The previous pair remains valid for 24 hours.

**`DELETE /auth`** *(requires current credentials)*
Deletes the merchant account. Blocked with a `400` if any payment is still `pending`.

### Payments

**`POST /payments`**
```json
{
  "amount": 0.05,
  "currency": "SOL",
  "label": "Order #4521",
  "message": "Thanks for your purchase"
}
```
`currency` is `"SOL"` or `"USDC"`. `label`/`message` are optional — shown in the customer's wallet UI, not used in verification. Returns a `solanaPayUrl` to render as a QR code, and the created payment record.

**`GET /payments/:paymentId`**
Fetch a single payment's current status.

**`GET /payments?status=confirmed&page=1&limit=20`**
List payments, scoped to your merchant account only. `status` filters by `pending` / `confirmed` / `expired` / `failed`.

### Payment statuses
| Status | Meaning |
|---|---|
| `pending` | Created, awaiting payment, not yet expired |
| `confirmed` | Verified on-chain — amount, token, recipient, and reference all matched |
| `failed` | A transaction referencing this payment was found but didn't pass verification |
| `expired` | No valid transaction found before the request's expiry window (15 min) |

---

## Setup

```bash
git clone https://github.com/swastikkakran/solana-payment-gateway.git
cd solana-payment-gateway
npm install
```

Create a `.env` file:

```env
PORT=3000
MONGO_URI=mongodb://localhost:27017/solana-payment-gateway
SOLANA_RPC_URL=<your devnet HTTP RPC endpoint — Helius or QuickNode recommended>
SOLANA_RPC_WSS_URL=<your devnet WebSocket RPC endpoint — same provider, wss:// protocol>
SOLANA_CLUSTER=devnet
USDC_MINT_ADDRESS=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
ENCRYPTION_MASTER_KEY=<32-byte hex string — generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
LOG_LEVEL=info
```

Note: two RPC URLs are required. The HTTP URL (`https://`) is used for RPC calls (`getTransaction`, `getSignaturesForAddress`). The WebSocket URL (`wss://`) is used for live log subscriptions. Most providers (Helius, QuickNode) give you both from the same dashboard — swap `https://` for `wss://` on the same endpoint.

Build and run:

```bash
npm run build
npm run start
```

Or for development without compiling:

```bash
npm run dev
```

The server connects to MongoDB, starts the API, and boots the watcher — restoring a live subscription for any merchant with an outstanding pending payment.

---

## Tech stack

- **Node.js / Express 5** — REST API
- **TypeScript** — full type coverage across services, models, middlewares, and controllers
- **MongoDB / Mongoose** — merchants, payment requests, webhook delivery records; typed via Mongoose document interfaces (`IMerchant`, `IPayment`, `IWebhook`)
- **@solana/kit** — RPC calls (`createSolanaRpc`), WebSocket subscriptions (`createSolanaRpcSubscriptions`, `logsNotifications`), address types, keypair generation
- **@solana/pay** (anza-xyz, v1) — Solana Pay URL construction, Kit-native
- **bcrypt** — API secret hashing
- **AES-256-GCM (Node `crypto`)** — webhook secret encryption
- **Zod** — request validation with inferred TypeScript types
- **pino** — structured logging
- **tsx** — TypeScript execution for development

---

## Architecture

```
src/
├── controllers/     # HTTP request/response handling
├── services/        # business logic (auth, payments, on-chain verification, webhooks)
├── middlewares/     # API-key auth, request validation
├── models/          # Merchant, PaymentRequest, WebhookDelivery (with TS interfaces)
├── routes/          # Express route definitions
├── types/           # Express Request augmentation (req.merchant)
├── validators/      # Zod schemas + param validation
├── watcher/         # WebSocket subscription lifecycle + boot-time reconciliation
└── utils/           # error/response shaping, crypto, logging
```

---

## v1 → v2: what changed

v1 was written in JavaScript using `@solana/web3.js` v1. v2 is a full migration to TypeScript and `@solana/kit`.

**Language:** JavaScript → TypeScript throughout. Strict mode enabled. Mongoose document interfaces on all three models. Express `Request` augmented with `req.merchant`.

**Solana SDK:** `@solana/web3.js` → `@solana/kit`. Key changes:
- `new Connection(url)` → `createSolanaRpc(url)` for HTTP RPC, `createSolanaRpcSubscriptions(wsUrl)` for WebSocket
- `connection.onLogs(pubkey, callback)` → `rpcSubscriptions.logsNotifications({ mentions: [address] }).subscribe({ abortSignal })` with a `for await` loop
- `Keypair.generate()` → `generateKeyPairSigner()` (async, returns `.address` directly as a base58 string)
- `new PublicKey(str)` → `address(str)` (branded `Address` type)
- Subscription management: numeric subscription IDs → `AbortController` stored per-merchant in a `Map`. Disconnect calls `controller.abort()`. Auto-reconnect on crash checks `controller.signal.aborted` before restarting.

**@solana/pay:** old `@solana/pay` (solana-labs) → `@solana/pay` v1 (anza-xyz), which is Kit-native.

**Two RPC URLs:** v1 used one `Connection` for both HTTP and WebSocket. v2 splits them — `SOLANA_RPC_URL` (https) for RPC calls, `SOLANA_RPC_WSS_URL` (wss) for subscriptions.

---

## Known limitations (v2)

- **Credential rotation supports exactly one grace-window credential set at a time.** A second rotation within an active grace window immediately invalidates the first — no queue of multiple valid old credentials.
- **Reconciliation sweeps check the most recent 50 transactions** against a merchant's wallet. A merchant with very high transaction volume and many simultaneously pending payments could theoretically have an older pending payment fall outside this window during a sweep.
- **SOL and USDC only.** No other SPL tokens are currently supported.
- **No refunds.** Out of scope — this system is detection/verification only, not fund movement (by design — it's non-custodial).

---

## Roadmap (v3)

The next version extends the gateway with a genuine on-chain Solana program, making it more than a detection layer:

- **On-chain merchant registry (Anchor program)** — merchant registration anchored on-chain via a PDA per merchant. Removes the off-chain MongoDB dependency for identity and creates an auditable, permissionless record of participating merchants.
- **On-chain payment record** — confirmed payments written to chain, not just to MongoDB. Gives merchants a cryptographic, tamper-proof receipt for every confirmed payment without relying on the gateway's database.
- **Token-2022 support** — transfer fees and interest-bearing mints break naive pre/post balance-diff parsing and need explicit handling at the on-chain level.
- **Recurring payments** — an on-chain program for subscription-style payments with merchant-defined intervals and amounts, enforced by the program rather than the backend.
