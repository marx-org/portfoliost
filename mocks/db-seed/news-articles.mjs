import { readFile } from "node:fs/promises"
import { SEED_POSITIONS } from "./constants.mjs"

const FIXTURE_URL = new URL("./fixtures/news_articles_all.json", import.meta.url)
const NEWS_EXPIRY_DAYS = 90

export async function seedNewsArticles(sql) {
  const fixture = JSON.parse(await readFile(FIXTURE_URL, "utf8"))
  const seededSymbols = new Set(SEED_POSITIONS.map((position) => position.symbol))
  const articles = (fixture.data ?? []).filter((row) =>
    seededSymbols.has(row.ticker)
    && typeof row.article?.url === "string"
    && typeof row.article?.title === "string"
    && typeof row.published_at === "string",
  )

  if (articles.length === 0) {
    throw new Error("news_articles_all.json has no articles for the seeded portfolio")
  }

  for (const row of articles) {
    await sql`
      INSERT INTO instruments.news_articles
        (url, title, summary, source, published_at, symbols, fetched_at, expires_at)
      VALUES
        (
          ${row.article.url},
          ${row.article.title},
          ${typeof row.article.description === "string" ? row.article.description : null},
          ${typeof row.metadata?.source === "string" ? row.metadata.source : null},
          ${row.published_at},
          ARRAY[${row.ticker}]::text[],
          now(),
          now() + ${NEWS_EXPIRY_DAYS} * interval '1 day'
        )
      ON CONFLICT (url) DO UPDATE SET
        title = EXCLUDED.title,
        summary = EXCLUDED.summary,
        source = EXCLUDED.source,
        published_at = EXCLUDED.published_at,
        symbols = (
          SELECT array_agg(DISTINCT symbol)::text[]
          FROM unnest(news_articles.symbols || EXCLUDED.symbols) AS symbol
        ),
        fetched_at = now(),
        expires_at = now() + ${NEWS_EXPIRY_DAYS} * interval '1 day'
    `
  }

  console.log(`[db-seed] news_articles: seeded ${articles.length} local portfolio-news fixtures`)
}
