import { readFileSync, readdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const DATA = join(ROOT, "shared", "data")
const RAW = join(DATA, "raw")
const RESEARCH = join(DATA, "research")

const cache = new Map()

export function loadJson(rel) {
  if (cache.has(rel)) return cache.get(rel)
  const abs = join(DATA, rel)
  const data = JSON.parse(readFileSync(abs, "utf8"))
  cache.set(rel, data)
  return data
}

export function loadRaw(name) {
  const rel = join("raw", name)
  if (cache.has(rel)) return cache.get(rel)
  const abs = join(RAW, name)
  if (fileNotExists(abs)) return null
  const data = JSON.parse(readFileSync(abs, "utf8"))
  cache.set(rel, data)
  return data
}

export function loadResearch(symbol) {
  const rel = join("research", `${normalize(symbol)}.json`)
  if (cache.has(rel)) return cache.get(rel)
  const abs = join(RESEARCH, `${normalize(symbol)}.json`)
  if (fileNotExists(abs)) return null
  const data = JSON.parse(readFileSync(abs, "utf8"))
  cache.set(rel, data)
  return data
}

export function researchSymbols() {
  return readdirSync(RESEARCH)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
}

export function loadUniverse() {
  return loadJson("universe.json")
}

export function loadBenchmarks() {
  return loadJson("benchmarks.json")
}

export function logoPath(symbol) {
  return join(DATA, "logos", `${normalize(symbol)}.svg`)
}

export function normalize(symbol) {
  return String(symbol).split(".")[0].toUpperCase()
}

function fileNotExists(p) {
  try {
    readFileSync(p)
    return false
  } catch {
    return true
  }
}
