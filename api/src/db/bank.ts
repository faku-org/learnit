import type { Db, Document, Filter, FindOptions } from "mongodb";

/**
 * The exercise bank: generated exercises shared by every student of a topic. It is NOT per-user data (the
 * per-user part is the SRS card in `user_exercises`, reached through `forUser`), so it lives here, next to the
 * isolation module, instead of as raw `.collection(` calls in the routes. Reads and inserts only: the bank is
 * append-only.
 */
export function exerciseBank(db: Pick<Db, "collection">) {
  const col = db.collection("exercises");
  return {
    find: (filter: Filter<Document> = {}, options?: FindOptions) => col.find(filter, options),
    findOne: (filter: Filter<Document> = {}, options?: FindOptions) => col.findOne(filter, options),
    countDocuments: (filter: Filter<Document> = {}) => col.countDocuments(filter),
    insertOne: (doc: Document) => col.insertOne(doc),
  };
}
