// Backfill the taxonomy fields onto documents written before the taxonomy work.
//
// This script is an OPTIMIZATION, not a prerequisite. Every read path resolves
// a pre-migration document through `subjectOf`, and `topicKeyOf` produces the
// same key a language path always had, so the application behaves identically
// whether or not this has run. Running it just saves the fallback.
//
//   bun run migrate           # report only, changes nothing
//   bun run migrate --apply   # write the changes
//
// The --preload in that script is not optional: bson@7 crashes on Bun without
// the v8 snapshot stub in preload.ts.
//
// Safe to run repeatedly: every update is scoped to documents still missing the
// field, and nothing is ever deleted or overwritten.

import { connectDB, disconnectDB } from "./db";
import { seedTaxonomy, matchSubject, lineageOf } from "./taxonomy";
import { subjectOf, bankKeyOf } from "./schemas";

const APPLY = process.argv.includes("--apply");

type Counts = { scanned: number; planned: number; skipped: number };

function line(label: string, c: Counts): string {
  return `  ${label.padEnd(22)} scanned ${String(c.scanned).padStart(6)}   to update ${String(c.planned).padStart(6)}   already done ${String(c.skipped).padStart(6)}`;
}

async function main(): Promise<void> {
  const db = await connectDB();
  await seedTaxonomy(db);

  console.log(`\nTaxonomy backfill  (${APPLY ? "APPLY" : "DRY RUN"})\n`);

  // ── paths ───────────────────────────────────────────────────────────────────
  const paths: Counts = { scanned: 0, planned: 0, skipped: 0 };
  const pathUpdates: { _id: unknown; set: Record<string, unknown> }[] = [];

  for (const doc of await db.collection("paths").find({}).toArray()) {
    paths.scanned++;
    if (doc.taxonomy && Array.isArray(doc.taxonomy) && doc.taxonomy.length > 0) {
      paths.skipped++;
      continue;
    }
    const legacyName = (doc.language as string | undefined) ?? (doc.subject as string | undefined);
    if (!legacyName) {
      paths.skipped++;
      continue;
    }
    // Prefer a real match against the tree, so "German" lands on language/german
    // rather than a slug that happens to look right.
    const matched = await matchSubject(db, legacyName);
    const taxonomy = matched
      ? await lineageOf(db, matched.id)
      : subjectOf({ language: legacyName }).taxonomy;

    pathUpdates.push({
      _id: doc._id,
      set: {
        subject: doc.subject ?? legacyName,
        taxonomy,
        taxonomyLeaf: taxonomy[taxonomy.length - 1],
        // Pinned to the name the path was CREATED with, not the canonical leaf.
        // A path created as "aleman" classifies to `german` but its bank is full
        // of `aleman:...` keys; moving the key would orphan every one of them.
        bankKey: bankKeyOf(doc as { language?: string; subject?: string }),
      },
    });
    paths.planned++;
  }

  // ── exercises ───────────────────────────────────────────────────────────────
  // topicKey is deliberately NOT rewritten: for a language path the new format
  // produces the identical string, so touching it would risk invalidating the
  // shared bank for no gain.
  const exercises: Counts = { scanned: 0, planned: 0, skipped: 0 };
  const exerciseUpdates: { _id: unknown; set: Record<string, unknown> }[] = [];
  let drifted = 0;

  for (const doc of await db.collection("exercises").find({}).toArray()) {
    exercises.scanned++;
    if (doc.taxonomyLeaf) {
      exercises.skipped++;
      continue;
    }
    const legacyName = (doc.language as string | undefined) ?? (doc.subject as string | undefined);
    if (!legacyName) {
      exercises.skipped++;
      continue;
    }
    const matched = await matchSubject(db, legacyName);
    const taxonomy = matched
      ? await lineageOf(db, matched.id)
      : subjectOf({ language: legacyName }).taxonomy;
    const leaf = taxonomy[taxonomy.length - 1];

    // The bank key is recovered from the stored topicKey, which is the only
    // authoritative record of which partition this exercise actually lives in.
    const storedKey = doc.topicKey as string | undefined;
    const bankKey = storedKey?.includes(":")
      ? storedKey.slice(0, storedKey.indexOf(":"))
      : bankKeyOf({ language: legacyName });

    if (bankKey !== leaf) {
      drifted++;
      if (drifted <= 3) {
        console.log(
          `    note: "${legacyName}" classifies to "${leaf}" but its bank is "${bankKey}"; keeping the bank as-is`,
        );
      }
    }

    exerciseUpdates.push({
      _id: doc._id,
      set: { subject: doc.subject ?? legacyName, taxonomy, taxonomyLeaf: leaf, bankKey },
    });
    exercises.planned++;
  }

  console.log(line("paths", paths));
  console.log(line("exercises", exercises));
  if (drifted > 0) {
    console.log(
      `\n  ${drifted} exercise(s) sit in a bank named differently from their taxonomy node.\n` +
        `  That is expected when a path was created in another language ("aleman" for German).\n` +
        `  Their bankKey is preserved, so every one of them stays reachable.`,
    );
  }

  if (!APPLY) {
    console.log(`\nDry run. Re-run with --apply to write ${paths.planned + exercises.planned} updates.\n`);
    await disconnectDB();
    return;
  }

  for (const u of pathUpdates) {
    await db.collection("paths").updateOne({ _id: u._id as never }, { $set: u.set });
  }
  for (const u of exerciseUpdates) {
    await db.collection("exercises").updateOne({ _id: u._id as never }, { $set: u.set });
  }

  // Indexes the taxonomy-aware queries rely on.
  await db.collection("paths").createIndex({ userId: 1, taxonomyLeaf: 1 });
  await db.collection("exercises").createIndex({ taxonomyLeaf: 1, type: 1 });
  await db.collection("calibration_blueprints").createIndex({ taxonomyLeaf: 1 }, { unique: true });

  console.log(`\nApplied ${pathUpdates.length + exerciseUpdates.length} updates and ensured indexes.\n`);
  await disconnectDB();
}

main().catch(async (err) => {
  console.error("Migration failed:", err);
  await disconnectDB();
  process.exit(1);
});
