import { MongoClient, Db } from "mongodb";

const MONGO_URI = process.env.MONGO_URI ?? "mongodb://localhost:27017";
const DB_NAME = process.env.DB_NAME ?? "learnit";

let client: MongoClient;
let db: Db;

export async function connectDB(): Promise<Db> {
  if (db) return db;
  client = new MongoClient(MONGO_URI);
  await client.connect();
  db = client.db(DB_NAME);
  console.log(`MongoDB connected: ${DB_NAME}`);
  return db;
}

export async function getDB(): Promise<Db> {
  if (!db) return connectDB();
  return db;
}

export async function disconnectDB(): Promise<void> {
  if (client) await client.close();
}
