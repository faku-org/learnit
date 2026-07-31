// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
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
