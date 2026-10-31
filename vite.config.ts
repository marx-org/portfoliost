import { fileURLToPath, URL } from "node:url"
import { createRequire } from "node:module"
import { readFileSync } from "node:fs"
import { defineConfig } from "vite"
import vue from "@vitejs/plugin-vue"

const require = createRequire(import.meta.url)
const vueCompiler = require("vue/compiler-sfc") as typeof import("vue/compiler-sfc")
const vueTypeScript = require("./tools/contracts-generator/node_modules/typescript") as typeof import("typescript")
vueCompiler.registerTS(() => vueTypeScript)

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8"))
const appVersion = process.env.APP_VERSION ?? pkg.version

export default defineConfig({
  // Vue's SFC compiler resolves imported types via TypeScript's `sys`. TS 7's
  // compiler no longer exposes the legacy `sys` surface it expects, so hand the
  // compiler a supported TS 5 file-system adapter from the isolated Vue/codegen
  // toolchain. The app's .ts source is separately checked by root TypeScript 7.
  plugins: [vue({ script: { fs: vueTypeScript.sys } })],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
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
