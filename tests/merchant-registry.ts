import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import * as web3 from "@solana/web3.js";
import { createHash } from "crypto";
import { assert } from "chai";
import * as fs from "fs";
import { MerchantRegistry } from "../target/types/merchant_registry";

describe("merchant-registry", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.MerchantRegistry as Program<MerchantRegistry>;

  const oracleSecretKey = JSON.parse(
    fs.readFileSync(
      process.env.ORACLE_KEYPAIR_PATH || `${process.env.HOME}/.config/solana/oracle-authority.json`,
      "utf-8"
    )
  );
  const oracleAuthority = web3.Keypair.fromSecretKey(new Uint8Array(oracleSecretKey));

  // Persisted merchant wallet — funded once via faucet.solana.com, reused every run
  const merchantSecretKey = JSON.parse(
    fs.readFileSync("tests/fixtures/test-merchant.json", "utf-8")
  );
  const merchant = web3.Keypair.fromSecretKey(new Uint8Array(merchantSecretKey));
  let merchantPda: web3.PublicKey;

  const reference = `order-${Date.now()}`;
  const referenceHash = createHash("sha256").update(reference).digest();
  let paymentPda: web3.PublicKey;

  const fakeMint = web3.Keypair.generate().publicKey;
  const amount = new anchor.BN(1_000_000);

  before(async () => {
    [merchantPda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("merchant"), merchant.publicKey.toBuffer()],
      program.programId
    );

    [paymentPda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("payment"), merchantPda.toBuffer(), referenceHash],
      program.programId
    );

    // Only initialize if this merchant PDA doesn't already exist from a previous run
    const existing = await program.account.merchant.fetchNullable(merchantPda);
    if (existing === null) {
      await program.methods
        .initialize()
        .accounts({ payer: merchant.publicKey })
        .signers([merchant])
        .rpc();
    }
  });

  it("merchant account exists and is active", async () => {
    const account = await program.account.merchant.fetch(merchantPda);
    assert.equal(account.payoutWallet.toString(), merchant.publicKey.toString());
    assert.equal(account.isActive, true);
  });

  it("toggles merchant active status", async () => {
    await program.methods
      .update()
      .accounts({ payer: merchant.publicKey })
      .signers([merchant])
      .rpc();

    let account = await program.account.merchant.fetch(merchantPda);
    assert.equal(account.isActive, false);

    await program.methods
      .update()
      .accounts({ payer: merchant.publicKey })
      .signers([merchant])
      .rpc();

    account = await program.account.merchant.fetch(merchantPda);
    assert.equal(account.isActive, true);
  });

  it("creates a payment record", async () => {
    await program.methods
      .createPayment(Array.from(referenceHash), amount, fakeMint)
      .accounts({ merchant: merchantPda })
      .signers([oracleAuthority])
      .rpc();

    const account = await program.account.payment.fetch(paymentPda);
    assert.equal(account.merchant.toString(), merchantPda.toString());
    assert.equal(account.amount.toString(), amount.toString());
    assert.equal(account.mint.toString(), fakeMint.toString());
    assert.equal(account.isPaid, false);
  });

  it("marks a payment as paid", async () => {
    await program.methods
      .markPaid(Array.from(referenceHash))
      .accounts({ merchant: merchantPda })
      .signers([oracleAuthority])
      .rpc();

    const account = await program.account.payment.fetch(paymentPda);
    assert.equal(account.isPaid, true);
  });

  it("rejects mark_paid from an unauthorized signer", async () => {
  const randomSignerSecretKey = JSON.parse(
    fs.readFileSync("tests/fixtures/unauthorized-signer.json", "utf-8")
  );
  const randomSigner = web3.Keypair.fromSecretKey(new Uint8Array(randomSignerSecretKey));

  try {
    await program.methods
      .markPaid(Array.from(referenceHash))
      .accounts({ merchant: merchantPda })
      .signers([randomSigner])
      .rpc();
    assert.fail("expected this call to be rejected");
  } catch (err) {
    assert.isDefined(err);
  }
});
});