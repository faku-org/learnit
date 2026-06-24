import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";

const app = new Elysia()
  .use(cors({ origin: "http://localhost:4321" }))
  .get("/api/health", () => ({
    status: "ok",
    timestamp: new Date().toISOString(),
  }))
  .listen(3001);

console.log(`API running on http://localhost:${app.server?.port}`);
