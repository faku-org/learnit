export type MemDoc = Record<string, unknown> & { _id: string };

type Query = Record<string, unknown>;

function valueMatches(doc: MemDoc, key: string, expected: unknown): boolean {
  if (key === "_id") return String(doc._id) === String(expected);
  if (expected !== null && typeof expected === "object" && !Array.isArray(expected)) {
    const op = expected as Record<string, unknown>;
    if ("$in" in op) return Array.isArray(op.$in) && op.$in.includes(doc[key]);
    if ("$ne" in op) return doc[key] !== op.$ne;
    if ("$gte" in op) return (doc[key] as number) >= (op.$gte as number);
    if ("$lt" in op) return (doc[key] as number) < (op.$lt as number);
  }
  return doc[key] === expected;
}

export function matches(doc: MemDoc, query: Query): boolean {
  return Object.entries(query).every(([k, v]) => valueMatches(doc, k, v));
}

type Update = {
  $set?: Record<string, unknown>;
  $setOnInsert?: Record<string, unknown>;
  $inc?: Record<string, number>;
};

const HEX = "0123456789abcdef";
/** A valid ObjectId-shaped id (24 hex chars). Routes cast ids with
 * `new ObjectId(...)`, so stored _ids must be hex for those casts not to throw. */
export const objectIdHex = () =>
  Array.from({ length: 24 }, () => HEX[Math.floor(Math.random() * 16)]).join("");
const nextId = () => objectIdHex();

export function memCollection() {
  const docs: MemDoc[] = [];

  const applyUpdate = (doc: MemDoc, update: Update): void => {
    if (update.$set) Object.assign(doc, update.$set);
    if (update.$setOnInsert) Object.assign(doc, update.$setOnInsert);
    if (update.$inc) {
      for (const [k, delta] of Object.entries(update.$inc)) {
        doc[k] = ((doc[k] as number) ?? 0) + delta;
      }
    }
  };

  return {
    async findOne(query: Query): Promise<MemDoc | null> {
      return docs.find((d) => matches(d, query)) ?? null;
    },
    find(query: Query) {
      const cursor = {
        sort: () => cursor,
        toArray: async (): Promise<MemDoc[]> => docs.filter((d) => matches(d, query)),
      };
      return cursor;
    },
    async insertOne(doc: Record<string, unknown>): Promise<{ insertedId: string }> {
      const stored = {
        _id: (doc._id as string | undefined) ?? nextId(),
        ...doc,
      } as MemDoc;
      docs.push(stored);
      return { insertedId: stored._id };
    },
    async updateOne(
      query: Query,
      update: Update,
      options?: { upsert?: boolean },
    ): Promise<{ modifiedCount: number }> {
      const hit = docs.find((d) => matches(d, query));
      if (hit) {
        applyUpdate(hit, update);
        return { modifiedCount: 1 };
      }
      if (options?.upsert) {
        const seed: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(query)) {
          if (k === "_id") continue;
          seed[k] = v;
        }
        const stored = {
          _id: nextId(),
          ...seed,
          ...update.$set,
          ...update.$setOnInsert,
        } as MemDoc;
        docs.push(stored);
        return { modifiedCount: 1 };
      }
      return { modifiedCount: 0 };
    },
    async updateMany(query: Query, update: Update): Promise<{ modifiedCount: number }> {
      let n = 0;
      for (const d of docs) {
        if (matches(d, query)) {
          applyUpdate(d, update);
          n++;
        }
      }
      return { modifiedCount: n };
    },
    async deleteOne(query: Query): Promise<{ deletedCount: number }> {
      const idx = docs.findIndex((d) => matches(d, query));
      if (idx === -1) return { deletedCount: 0 };
      docs.splice(idx, 1);
      return { deletedCount: 1 };
    },
    async countDocuments(query: Query = {}): Promise<number> {
      return docs.filter((d) => matches(d, query)).length;
    },
    _docs: docs,
  };
}

/** A fake Mongo `Db` backed by in-memory arrays. Seed by inserting docs first. */
export function memDb() {
  const cols = new Map<string, ReturnType<typeof memCollection>>();
  return {
    collection(name: string) {
      let col = cols.get(name);
      if (!col) {
        col = memCollection();
        cols.set(name, col);
      }
      return col;
    },
  };
}
