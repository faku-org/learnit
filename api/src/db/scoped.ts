import type { Db, Document, Filter, FindOptions, UpdateFilter, UpdateOptions } from "mongodb";

/**
 * Isolation below the API. A collection holding one user's data is only reachable through `forUser(db, userId)`,
 * which puts `userId` into every filter and every inserted document; a handler cannot forget it, and cannot
 * override it (the scope is applied last). `scripts/check-scoped.ts` fails when `.collection(` shows up outside
 * this directory, so new queries come through here.
 */
export const USER_COLLECTIONS = [
  "attempts",
  "feedback",
  "goals",
  "module_completions",
  "paths",
  "preferences",
  "progress",
  "streak",
  "topic_sessions",
  "user_exercises",
  "vocabulary",
] as const;

export type UserCollection = (typeof USER_COLLECTIONS)[number];

export function forUser(db: Pick<Db, "collection">, userId: string) {
  if (!userId) throw new Error("forUser needs a user id");

  const scope = (filter: Filter<Document> = {}): Filter<Document> => ({ ...filter, userId });

  const of = (name: UserCollection) => {
    const col = db.collection(name);
    return {
      find: (filter: Filter<Document> = {}, options?: FindOptions) => col.find(scope(filter), options),
      findOne: (filter: Filter<Document> = {}, options?: FindOptions) => col.findOne(scope(filter), options),
      countDocuments: (filter: Filter<Document> = {}) => col.countDocuments(scope(filter)),
      insertOne: (doc: Document) => col.insertOne({ ...doc, userId }),
      updateOne: (filter: Filter<Document>, update: UpdateFilter<Document>, options?: UpdateOptions) =>
        col.updateOne(scope(filter), update, options),
      updateMany: (filter: Filter<Document>, update: UpdateFilter<Document>) =>
        col.updateMany(scope(filter), update),
      deleteOne: (filter: Filter<Document>) => col.deleteOne(scope(filter)),
      deleteMany: (filter: Filter<Document> = {}) => col.deleteMany(scope(filter)),
    };
  };

  return {
    of,
    /** Every row the user owns, in every user collection. Account deletion is real deletion (ADR 0002). */
    async deleteEverything(): Promise<Record<UserCollection, number>> {
      const results = await Promise.all(
        USER_COLLECTIONS.map(async (name) => [name, (await of(name).deleteMany()).deletedCount ?? 0] as const),
      );
      return Object.fromEntries(results) as Record<UserCollection, number>;
    },
  };
}

export type UserScope = ReturnType<typeof forUser>;
