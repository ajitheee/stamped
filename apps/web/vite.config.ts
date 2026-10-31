import { fileURLToPath } from "node:url"

import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react()],
  // The screens import the shared contract and rules from apps/api/src; resolve zod from this app either way.
  resolve: { dedupe: ["zod"] },
  server: {
    port: 5173,
    fs: { allow: [fileURLToPath(new URL("..", import.meta.url))] },
    proxy: { "/api": `http://127.0.0.1:${process.env.API_PORT ?? 3001}` },
  },
})
