import { app } from "./app";

app.listen({ port: Number(process.env.PORT ?? 3001) });

console.log(`LearnIt! API running on http://localhost:${app.server?.port}`);
