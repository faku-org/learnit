import { afterAll, afterEach, beforeAll } from "bun:test";
import { setupServer } from "msw/node";
import { handlers } from "@tests/handlers";

/** An MSW server preloaded with the shared handlers. Override per test with `server.use`. */
export function useMsw(opts: { onUnhandledRequest?: "error" | "warn" } = {}) {
  const server = setupServer(...handlers);
  beforeAll(() => server.listen({ onUnhandledRequest: opts.onUnhandledRequest ?? "error" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());
  return server;
}
