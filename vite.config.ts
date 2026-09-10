import { fileURLToPath, URL } from "node:url"
import { readFileSync } from "node:fs"
import { defineConfig } from "vite"
import vue from "@vitejs/plugin-vue"

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8"))

export default defineConfig({
  plugins: [vue()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET || "http://localhost:4010",
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "happy-dom",
    globals: true,
    include: ["tests/unit/**/*.{test,spec}.ts"],
    setupFiles: ["tests/unit/setup.ts"],
  },
})
