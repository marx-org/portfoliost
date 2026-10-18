# Portfoliost-specific repository checklist

Start with the project-wide checklist in
[`pfire-docs/docs/NEW_REPOSITORY.md`](https://github.com/marx-org/pfire-docs/blob/main/docs/NEW_REPOSITORY.md).
This companion records only the decisions and checks that are specific to the
`portfoliost` application repository.

## Application tier

- [ ] The repository is recorded as the App tier in
      [`pfire-docs/docs/MODULARISATION.md`](https://github.com/marx-org/pfire-docs/blob/main/docs/MODULARISATION.md).
- [ ] The project-wide repository, board, issue-type, release, and registration
      checks in the linked playbook are complete.

## Contracts

- [ ] `@marx-org/contracts` is installed and `.npmrc` maps
      `@marx-org:registry=https://npm.pkg.github.com`.
- [ ] `gen:types` reads `node_modules/@marx-org/contracts/openapi.yaml` and
      writes `generated/api-types.d.ts`.
- [ ] API client functions and generated consumers use the contract's
      `components` types rather than duplicate local shapes.
- [ ] `npm run gen:types` and the generated-file diff are clean after a contract
      release.

## Compose and application checks

- [ ] `docker-compose.yml` provides the app, gateway, mock, and required module
      services described in the root README.
- [ ] `deploy/services.env` remains the single source of truth for gateway
      upstreams; module switches are verified through the gateway.
- [ ] `npm run build` passes.
- [ ] `npm run test` passes.
- [ ] `npm run test:mock` passes.
- [ ] `npm run test:stack` passes for the selected real/mock mode.
- [ ] `npm run test:e2e` passes against a freshly recreated compose stack.

## Application-owned documentation

- [ ] API changes update [`docs/api/`](api/).
- [ ] Database changes update [`docs/migrations/`](migrations/) and follow the
      project migration proposal in `pfire-docs`.
- [ ] Component changes follow [`COMPONENTS.md`](COMPONENTS.md).
