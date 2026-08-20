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
   │                          │ live tx detected (onLogs)│                         │
   │                          │<─────────────────────────┤                         │
   │                          │  verify amount/token/    │                         │
   │                          │  recipient/reference     │                         │
   │                          │  mark payment "confirmed"│                         │
   │  <- signed webhook       │                          │                         │
   │<─────────────────────────┤                          │                         │
```

1. Merchant creates a payment request via the API.
2. The backend generates a one-time **reference key** (a disposable public key used purely to tag the transaction — it never holds funds and never signs anything) and builds a [Solana Pay](https://docs.solanapay.com/) URL.
3. The merchant shows this as a QR code or link. The customer pays directly from their own wallet to the merchant's wallet, on-chain.
4. A live websocket subscription (`onLogs`) watches the merchant's payout wallet. The moment a matching transaction lands, it's parsed, verified against the expected amount/token/recipient/reference, and the payment is marked `confirmed`.
5. A signed webhook is delivered to the merchant's server, with automatic retry on failure.

---

## Why a reference key?

Solana transactions have no native concept of "orders." A transfer only knows sender, recipient, amount — nothing that says *which* payment request it belongs to. If a merchant has multiple pending payments for the same amount, there's no way to tell them apart from the transaction alone.

The fix: at creation time, this backend generates a fresh keypair and includes **only its public key** as a non-signing, non-writable account in the eventual transaction (part of the Solana Pay spec, not the base protocol). It's a disposable tag, not a wallet — used purely so the watcher can find and match the exact payment a transaction belongs to.

---

## Detection: live watcher + reconciliation sweep

Real-time detection alone isn't enough — a websocket subscription only catches events that happen *while it's connected*. If the server restarts or a connection drops, anything that happened during that gap would be missed. This system uses two complementary mechanisms:

- **Live subscription (`onLogs`)** — one websocket subscription per merchant, filtered to their `payoutWallet`. Fires in real time the moment a matching transaction lands.
- **Reconciliation sweep** — runs once whenever a merchant's subscription is (re)established: at server boot, and whenever a merchant creates their first pending payment while unwatched. It queries recent transactions against the merchant's wallet directly and checks each one against currently pending payments — catching anything that happened while nothing was listening.

Both paths converge on the same verification logic (`verifyTransaction`) and the same confirmation/webhook logic (`confirmAndNotify`), so a live-detected payment and a reconciled one are verified identically — no duplicated, divergent logic between the two.

This was tested directly: a payment created, paid *while the server was offline*, and correctly picked up and confirmed by the reconciliation sweep on restart — with the webhook still firing correctly.

---

## Security model

- **API key + secret**, not sessions. This is a developer-facing API — merchants integrate from their own backend, not a browser — so there's no login flow. The API secret is the credential; it's shown once, at registration, and never stored or transmitted in raw form again (only its bcrypt hash is persisted).
- **Credential rotation with a grace window.** Rotating keys doesn't require flipping a switch and hoping every server picks up the new key instantly — the previous credential set remains valid for 24 hours after rotation, then automatically stops working. (v1 supports exactly one grace-window credential set at a time; a second rotation within an active window immediately invalidates the first.)
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
SOLANA_RPC_URL=<your devnet RPC endpoint — a dedicated provider like Helius/QuickNode is strongly recommended over the public endpoint, which rate-limits aggressively>
SOLANA_CLUSTER=devnet
USDC_MINT_ADDRESS=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
ENCRYPTION_MASTER_KEY=<32-byte hex string — e.g. generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
LOG_LEVEL=info
```

```bash
npm run start
```

The server connects to MongoDB, starts the API, and boots the watcher — reconnecting a live subscription for any merchant with an outstanding pending payment.

---

## Tech stack

- **Node.js / Express** — REST API
- **MongoDB / Mongoose** — merchants, payment requests, webhook delivery records
- **@solana/web3.js** — RPC connection, transaction parsing, live log subscriptions
- **@solana/pay** — Solana Pay URL construction
- **bcrypt** — API secret hashing
- **AES-256-GCM (Node `crypto`)** — webhook secret encryption
- **Zod** — request validation
- **pino** — structured logging

---

## Known limitations (v1)

Documented honestly rather than hidden — these are deliberate scoping decisions for a v1, not oversights:

- **Websocket reconnection uses `@solana/web3.js` v1's `Connection`/`onLogs`**, which has a known internal reconnection issue (`_resetSubscriptions` can fail to clear a stale subscription ID, occasionally causing missed logs after a reconnect). This is mitigated, not eliminated, by the reconciliation sweep running on every reconnect. `@solana/web3.js` v2's `RpcSubscriptions` (async-iterator based) solves this properly and is the intended future migration.
- **Credential rotation supports exactly one grace-window credential set at a time.** A second rotation within an active grace window immediately invalidates the first — no queue of multiple valid old credentials.
- **Reconciliation sweeps check the most recent 50 transactions** against a merchant's wallet. A merchant with very high transaction volume and many simultaneously pending payments could theoretically have an older pending payment fall outside this window during a sweep.
- **`amount` and `currency` aren't independently validated beyond the schema enum at request time.** This is safe because on-chain verification is the actual backstop — a payment request can't be falsely confirmed regardless of what's submitted at creation, since confirmation requires a real matching on-chain transaction. Invalid input at worst creates a payment request that will simply never confirm. Stricter input validation is deferred to a later version.
- **SOL and USDC only.** No other SPL tokens are currently supported.

---

## Architecture

```
src/
├── controllers/     # HTTP request/response handling
├── services/        # business logic (auth, payments, on-chain verification, webhooks)
├── middlewares/      # API-key auth, request validation
├── models/           # Merchant, PaymentRequest, WebhookDelivery
├── routes/            # Express route definitions
├── validators/         # Zod schemas + param validation
├── watcher/             # websocket connection lifecycle + boot-time reconciliation
└── utils/                # error/response shaping, crypto, logging
```

---

## PS

While researching about Solana SDKs, I got to know that the @solana/web3.js is been replaced by the @solana/kit. This is currently in development, but still many programs have been migrated to it. So I thought about migrating my project to it. So 1stly, I'm going to migrate all the code into TypeScript. and Then migrate the main watcher to @solana/kit. Why like this, because I'm learning native solana programs in rust on parallel.
Why Do this at all? Because why not...
This will help me get familiar with the kit SDK, also a fun way to upgrade my project. So, here is the revised Roadmap.


## Roadmap

- Migrate the existing program into TypeScript. #Done
- Migrate to @solana/kit from @solana/web3.js.
- Add on onchain program to it (I have no idea what else I can add to it, but maybe in future, I will make it on chain too).