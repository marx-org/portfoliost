// Run against a locally loaded multi-platform image or a published release:
// node scripts/docker-image-smoke.mjs IMAGE
// Both runtimes must serve identical browser assets and preserve OIDC config.
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { setTimeout } from "node:timers/promises"
import { runInNewContext } from "node:vm"

const image = process.argv[2]
assert.ok(image, "Usage: node scripts/docker-image-smoke.mjs IMAGE")
const docker = (...args) => execFileSync("docker", args, { encoding: "utf8" }).trim()
const hashes = []

for (const [platform, arch] of [["linux/amd64", "x64"], ["linux/arm64", "arm64"]]) {
  const id = docker("run", "-d", "--platform", platform,
    "-p", "127.0.0.1::80",
    "-e", "OIDC_ISSUER_URL=https://identity.example.test",
    "-e", "OIDC_CLIENT_ID=image-smoke",
    "-e", "PASSWORD_LOGIN_ENABLED=true", image)
  try {
    const address = docker("port", id, "80/tcp")
    const base = `http://${address}`
    let html
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        const response = await fetch(base, { signal: AbortSignal.timeout(2000) })
        if (response.ok) { html = await response.text(); break }
      } catch { /* HTTP readiness, including emulated runtime startup. */ }
      await setTimeout(500)
    }
    assert.ok(html?.includes('<div id="app">'), "SPA index must be served")
    assert.equal(docker("exec", id, "node", "-p", "process.arch"), arch)
    assert.equal(docker("exec", id, "node", "-p",
      "require('/opt/serve/node_modules/serve/package.json').version"), "14.2.6")

    const deep = await fetch(`${base}/en/charting/income`)
    assert.equal(deep.status, 200)
    assert.equal(await deep.text(), html, "SPA deep links must fall back to index")

    const config = await fetch(`${base}/runtime-config.js`)
    assert.equal(config.status, 200)
    const sandbox = { window: {} }
    runInNewContext(await config.text(), sandbox, { timeout: 1000 })
    assert.equal(sandbox.window.__OIDC_CONFIG__.issuerUrl, "https://identity.example.test")
    assert.equal(sandbox.window.__OIDC_CONFIG__.clientId, "image-smoke")
    assert.equal(sandbox.window.__OIDC_CONFIG__.passwordLoginEnabled, true)

    const asset = html.match(/src="(\/assets\/[^\"]+\.js)"/)?.[1]
    assert.ok(asset, "index must reference a built JS asset")
    const js = await fetch(new URL(asset, base), { headers: { "Accept-Encoding": "gzip" } })
    assert.equal(js.status, 200)
    assert.match(js.headers.get("content-type"), /javascript/)
    assert.equal(js.headers.get("content-encoding"), "gzip", "JS compression must work")
    const hash = createHash("sha256").update(Buffer.from(await js.arrayBuffer())).digest("hex")
    hashes.push(hash)
    console.log(JSON.stringify({ platform, arch, serve: "14.2.6", deepLink: "ok", runtimeConfig: "ok", assetSha256: hash }))
  } finally {
    docker("rm", "-f", id)
  }
}
assert.equal(hashes[0], hashes[1], "Both runtime architectures must serve identical JS")
