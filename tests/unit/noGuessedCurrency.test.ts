import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * §66.2 — a currency is never guessed.
 *
 * `formatCurrency` / `formatSignedCurrency` / `formatCompactCurrency` take a
 * *required* currency so the compiler catches call sites that do not know it.
 * These tests close the two ways that guarantee can be bypassed:
 *
 *  1. a call site passing fewer than two arguments (the default is back);
 *  2. a `|| "USD"` / `?? "USD"` / `= "USD"` fallback reintroduced anywhere, which
 *     would satisfy the signature while still labelling an amount with a symbol
 *     that was never true.
 *
 * Both were live bugs: the cards rendered PLN amounts with a `$` because
 * `formatCurrency(portfolio.currentValue)` had no currency argument.
 */

const SRC = join(process.cwd(), "src")

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|vue)$/.test(entry) && !/\.test\.ts$/.test(entry)) out.push(full)
  }
  return out
}

/** The one sanctioned "USD" default: the user's display-currency *preference*.
 * It is a choice the user makes from the /api/currencies registry, never a
 * stand-in for the currency of a value. */
const ALLOWED_USD_DEFAULTS = new Set(["src/stores/displayCurrency.ts"])

const CURRENCY_FORMATTERS = /\b(formatCurrency|formatSignedCurrency|formatCompactCurrency)\s*\(/g
const GUESSED_FALLBACK = /(\|\||\?\?|=)\s*(?:\(\s*)?["']USD["']/

describe("§66.2 no guessed currency", () => {
  const files = walk(SRC)

  it("finds source files to check (sanity)", () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it("every currency formatter call passes a currency argument", () => {
    const offenders: string[] = []
    for (const file of files) {
      const src = readFileSync(file, "utf8")
      for (const m of src.matchAll(CURRENCY_FORMATTERS)) {
        // walk the argument list, tracking nesting, to count top-level args
        let depth = 0
        let args = 0
        let seen = false
        for (let i = m.index + m[0].length - 1; i < src.length; i++) {
          const ch = src[i]
          if (ch === "(" || ch === "[" || ch === "{") {
            depth++
            if (depth === 1 && ch === "(") continue
            seen = true
            continue
          }
          if (ch === ")" || ch === "]" || ch === "}") {
            depth--
            if (depth === 0) {
              if (seen || src.slice(m.index + m[0].length, i).trim() !== "") args++
              break
            }
            continue
          }
          if (ch === "," && depth === 1) args++
        }
        if (args < 2) {
          const line = src.slice(0, m.index).split("\n").length
          offenders.push(`${file.replace(process.cwd() + "/", "")}:${line} ${m[1]}`)
        }
      }
    }
    expect(offenders, `call a currency formatter without a currency:\n${offenders.join("\n")}`).toEqual([])
  })

  it('has no || "USD" / ?? "USD" / = "USD" fallback outside the display preference', () => {
    const offenders: string[] = []
    for (const file of files) {
      const rel = file.replace(process.cwd() + "/", "")
      if (ALLOWED_USD_DEFAULTS.has(rel)) continue
      const src = readFileSync(file, "utf8")
      src.split("\n").forEach((line, i) => {
        // comments may legitimately name the old bug
        const code = line.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "")
        if (GUESSED_FALLBACK.test(code)) offenders.push(`${rel}:${i + 1}  ${line.trim()}`)
      })
    }
    expect(offenders, `a currency is being guessed:\n${offenders.join("\n")}`).toEqual([])
  })
})
