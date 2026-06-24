import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { ObjectId } from "mongodb";
import { connectDB, getDB } from "./db";
import { GoalSchema, VocabularySchema } from "./schemas";

const app = new Elysia()
  .use(cors({ origin: "http://localhost:4321" }))
  .onStart(async () => {
    await connectDB();
  })

  .get("/api/health", () => ({
    status: "ok",
    timestamp: new Date().toISOString(),
  }))

  // === Goals ===
  .get("/api/goals", async () => {
    const db = await getDB();
    const goals = await db
      .collection("goals")
      .find()
      .sort({ createdAt: -1 })
      .toArray();
    return goals.map((g) => ({ ...g, _id: g._id.toString() }));
  })

  .post("/api/goals", async ({ body, set }) => {
    const db = await getDB();
    const parsed = GoalSchema.safeParse(body);
    if (!parsed.success) {
      set.status = 400;
      return { error: parsed.error.issues };
    }
    const goal = {
      ...parsed.data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const result = await db.collection("goals").insertOne(goal);
    return { _id: result.insertedId.toString(), ...goal };
  })

  .put("/api/goals/:id", async ({ params: { id }, body, set }) => {
    const db = await getDB();
    const parsed = GoalSchema.partial().safeParse(body);
    if (!parsed.success) {
      set.status = 400;
      return { error: parsed.error.issues };
    }
    const update = { ...parsed.data, updatedAt: new Date().toISOString() };
    await db
      .collection("goals")
      .updateOne({ _id: new ObjectId(id) }, { $set: update });
    const updated = await db
      .collection("goals")
      .findOne({ _id: new ObjectId(id) });
    if (!updated) {
      set.status = 404;
      return { error: "Not found" };
    }
    return { ...updated, _id: updated._id.toString() };
  })

  .delete("/api/goals/:id", async ({ params: { id }, set }) => {
    const db = await getDB();
    const result = await db
      .collection("goals")
      .deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      set.status = 404;
      return { error: "Not found" };
    }
    return { success: true };
  })

  // === Streak ===
  .get("/api/streak", async () => {
    const db = await getDB();
    let streak = await db.collection("streak").findOne({});
    if (!streak) {
      const initial = {
        currentStreak: 0,
        longestStreak: 0,
        lastSessionDate: null,
      };
      await db.collection("streak").insertOne(initial);
      return initial;
    }
    return { ...streak, _id: streak._id.toString() };
  })

  .post("/api/streak/update", async () => {
    const db = await getDB();
    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 86400000)
      .toISOString()
      .split("T")[0];

    let streak = await db.collection("streak").findOne({});
    if (!streak) {
      const initial = {
        currentStreak: 1,
        longestStreak: 1,
        lastSessionDate: today,
      };
      await db.collection("streak").insertOne(initial);
      return initial;
    }

    if (streak.lastSessionDate === today) {
      return { ...streak, _id: streak._id.toString() };
    }

    let newStreak =
      streak.lastSessionDate === yesterday ? streak.currentStreak + 1 : 1;

    const updated = {
      currentStreak: newStreak,
      longestStreak: Math.max(streak.longestStreak, newStreak),
      lastSessionDate: today,
    };

    await db.collection("streak").updateOne({}, { $set: updated });
    return updated;
  })

  // === Vocabulary ===
  .get("/api/vocabulary", async () => {
    const db = await getDB();
    const words = await db
      .collection("vocabulary")
      .find()
      .sort({ createdAt: -1 })
      .toArray();
    return words.map((w) => ({ ...w, _id: w._id.toString() }));
  })

  .post("/api/vocabulary", async ({ body, set }) => {
    const db = await getDB();
    const parsed = VocabularySchema.safeParse(body);
    if (!parsed.success) {
      set.status = 400;
      return { error: parsed.error.issues };
    }
    const entry = { ...parsed.data, createdAt: new Date().toISOString() };
    const result = await db.collection("vocabulary").insertOne(entry);
    return { _id: result.insertedId.toString(), ...entry };
  })

  .delete("/api/vocabulary/:id", async ({ params: { id }, set }) => {
    const db = await getDB();
    const result = await db
      .collection("vocabulary")
      .deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      set.status = 404;
      return { error: "Not found" };
    }
    return { success: true };
  })

  .listen(3001);

console.log(`LearnIt! API running on http://localhost:${app.server?.port}`);
