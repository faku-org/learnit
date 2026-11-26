// Fails when the API touches a Mongo collection outside the modules that own isolation.
//
//   api/src/db/        forUser(): per-user collections, scope applied by construction
//   api/src/accounts/  identity (users, sessions, recovery codes) behind the AccountStore port
//
// Everything else must go through `forUser(...).of(name)`. Code written before that rule keeps an allowance
// per file: the number of raw `.collection(` calls it may still have. The allowance only goes down. When a
// file drops below it, this script fails until the number is lowered here, so a migrated query cannot be
// quietly re-added as a raw one.
import { Glob } from "bun";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

const OWNERS = ["api/src/db/", "api/src/accounts/"];

/** Raw `.collection(` calls that predate `forUser`. Shared collections (taxonomy, sources, the exercise bank,
 * calibration blueprints) are not per-user and stay raw; per-user ones in app.ts are the ones to migrate. */
const LEGACY: Record<string, number> = {
  "api/src/app.ts": 43,
  "api/src/migrate-taxonomy.ts": 7,
  "api/src/semantic.ts": 3,
  "api/src/sources/index.ts": 4,
  "api/src/taxonomy.ts": 4,
};

const isComment = (line: string): boolean => /^\s*(\/\/|\/\*|\*)/.test(line);

let failed = false;
const seen = new Set<string>();

for await (const path of new Glob("api/src/**/*.ts").scan({ cwd: root })) {
  const file = path.replaceAll("\\", "/");
  if (OWNERS.some((owner) => file.startsWith(owner))) continue;

  const text = await Bun.file(`${root}${file}`).text();
  const count = text
    .split("\n")
    .filter((line) => !isComment(line))
    .reduce((total, line) => total + (line.match(/\.collection\s*\(/g)?.length ?? 0), 0);

  const allowed = LEGACY[file] ?? 0;
  if (count > allowed) {
    failed = true;
    console.error(
      `${file}: ${count} raw .collection( call(s), ${allowed} allowed. Use forUser(db, userId).of(name) from api/src/db/scoped.ts.`,
    );
  } else if (count < allowed) {
    failed = true;
    console.error(`${file}: down to ${count} raw .collection( call(s). Lower its allowance in scripts/check-scoped.ts from ${allowed} to ${count}.`);
  }
  if (file in LEGACY) seen.add(file);
}

for (const file of Object.keys(LEGACY)) {
  if (!seen.has(file)) {
    failed = true;
    console.error(`${file}: listed in LEGACY but not found. Remove it from scripts/check-scoped.ts.`);
  }
}

if (failed) process.exit(1);
console.log("check-scoped: ok");
