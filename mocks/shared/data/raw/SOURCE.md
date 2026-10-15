# Seed data

Synthetic seed data for the mock Example service. The files in this folder are
loaded at runtime by the mock server (`loadRaw` in `mocks/lib/data.js`); the
CI `test:mock` job and the e2e suite depend on them, so edit by PR and run
`npm run test:mock` after changes.
