// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';

// The browser only ever talks to its own origin. In dev, `/api` is forwarded to the API process so the
// HttpOnly session cookie is first-party; in production nginx does the same job.
const env = loadEnv(process.env.NODE_ENV ?? 'development', process.cwd(), '');
const apiPort = env.PUBLIC_API_PORT ?? '3001';

export default defineConfig({
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    server: {
      proxy: {
        '/api': `http://localhost:${apiPort}`,
      },
    },
    resolve: {
      dedupe: ["react", "react-dom"],
      alias: {
        // Mirrors the "@shared/*" mapping in tsconfig.json. The grading ladder
        // has to behave identically on both sides of the wire, so the client
        // imports the server's module instead of keeping a copy in step.
        "@shared": fileURLToPath(new URL("./api/src", import.meta.url)),
      },
    },
  },
});
