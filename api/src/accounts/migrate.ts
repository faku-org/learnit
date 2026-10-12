// Give every pre-accounts user (Google sign-in only) the fields the account core needs: a handle, a display
// name, an encrypted email. Their documents are otherwise untouched, and nobody has to run this: the Google
// callback does the same for a user the first time they sign in again. Running it up front just means handles
// exist before anyone returns.
//
//   bun run migrate:accounts           # report only, changes nothing
//   bun run migrate:accounts --apply   # write the changes
//
// Needs LEARNIT_SECRET_KEY (or _FILE) to encrypt the email; without it the plaintext `email` is left in place and
// only the handle and display name are added. Safe to run repeatedly: only documents without a handle are touched.

import { connectDB, disconnectDB } from "../db";
import { backfillLegacyUser, box } from "./index";
import { COLLECTIONS } from "./mongo-store";

const APPLY = process.argv.includes("--apply");

async function main(): Promise<void> {
  const db = await connectDB();
  const users = await db.collection(COLLECTIONS.users).find({}).toArray();
  const pending = users.filter((doc) => typeof doc.handle !== "string" || !doc.handle);
  const encrypts = await box.enabled();

  console.log(`\nAccounts backfill  (${APPLY ? "APPLY" : "DRY RUN"})\n`);
  console.log(`  users scanned        ${String(users.length).padStart(6)}`);
  console.log(`  to give a handle     ${String(pending.length).padStart(6)}`);
  console.log(`  already done         ${String(users.length - pending.length).padStart(6)}`);
  console.log(`  email encryption     ${encrypts ? "on" : "OFF (plaintext email stays; set LEARNIT_SECRET_KEY)"}`);

  if (APPLY) {
    for (const doc of pending) await backfillLegacyUser(doc);
    console.log("\nDone.");
  } else if (pending.length > 0) {
    console.log("\nNothing written. Re-run with --apply.");
  }

  await disconnectDB();
}

await main();
