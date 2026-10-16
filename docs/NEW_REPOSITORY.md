# Configuring a new repository in pfire

Checklist for bringing a new `pfire` repository into the project. Every item is
checkable. Where something is not yet automatable, it says so and links the ticket.

Related: [`MODULARISATION.md`](./MODULARISATION.md) for the module tiers and
playbook naming. Root `AGENTS.md` for the release flow and step-test-commit discipline.

---

## 1. Decide the tier first

The tier determines the stack, the compose services, and whether contracts apply.

| Tier | Stack | Members |
|---|---|---|
| Provider | Python + `requirements.txt` | `openst`, `cachest` |
| Module | Hono + Drizzle + Postgres + PGLite + jose | `portfoliost-users-auth`, `portfoliost-instruments`, `portfoliost-wallets`, `portfoliost-admin` |
| Contracts | OpenAPI spec only, no runtime | `portfoliost-contracts` |
| App | Vue + Vite | `portfoliost` |

- [ ] Tier decided and recorded in `MODULARISATION.md`

## 2. GitHub configuration

### Board membership
Every repository's issues must be added to the `pfire` project explicitly. Linking
the project to a repository is implicit and is **not** configured in repository settings.

- [ ] Issues added to the board:
  ```
  gh project item-add 1 --owner marx-org --url https://github.com/marx-org/<repo>/issues/1
  ```
  Sub-issues inherit board membership from their parent, so only roots need adding.

### Issue types
`Task` / `Bug` / `Feature` are configured at the **organization** level and cannot be
set on user-owned repositories. Confirm assignment actually works:

- [ ] `gh api graphql -f query='mutation { updateIssue(input:{id:"<iid>", issueTypeId:"<tid>"}){ issue{ issueType{name} } } }'` returns a type

**Do not** treat `gh api repos/<owner>/<repo>/issue-types` as proof — it reports the
three defaults as `is_enabled: true` on user-owned repositories while every write
silently no-ops. Blocked on [#6](https://github.com/Marx2/portfoliost/issues/6).

### Labels
No taxonomy is enforced yet. Until [#17](https://github.com/Marx2/portfoliost/issues/17)
sets an organisation baseline, adopt at minimum:

- [ ] `type:*` — only if native issue types are unavailable
- [ ] `area:*` — the module or surface

### Branch protection
- [ ] `main` protected

Only available on **public** repositories under the Free plan. For a private
repository this requires GitHub Team or Enterprise — see
[#13](https://github.com/Marx2/portfoliost/issues/13).

## 3. Contracts

Only for Module-tier repositories and the app.

- [ ] `@marx-org/contracts` in dependencies
- [ ] `.npmrc` contains `@marx2:registry=https://npm.pkg.github.com`
- [ ] `gen:types` script present, pointing at the **local** spec in the installed package:
  ```
  # module tier
  openapi-typescript node_modules/@marx-org/contracts/openapi.yaml -o src/generated/api-types.d.ts
  # app
  openapi-typescript node_modules/@marx-org/contracts/openapi.yaml -o generated/api-types.d.ts
  ```
- [ ] `generated/api-types.d.ts` committed
- [ ] Import types via `components["schemas"]["..."]` — never redeclare a shape locally

To consume a new contracts version:

- [ ] `gh release list --repo <owner>/portfoliost-contracts` — the version is written by CI, never by hand
- [ ] `NODE_AUTH_TOKEN=$(gh auth token) npm install @marx-org/contracts@<version>`
- [ ] `npm run gen:types`
- [ ] commit `package-lock.json` and the regenerated types

## 4. GHA image build

Every deployable repository publishes to `ghcr.io/<owner>/<repo>`.

- [ ] `.github/workflows/docker-image.yml` present and active
- [ ] Builds on push to `main`, publishes on merge to `main`
- [ ] `APP_VERSION` build-arg wired from the release job output:
  ```
  APP_VERSION=${{ needs.release.outputs.version }}
  ```
- [ ] Repository secret or org secret for registry auth as required
- [ ] Never tag manually — CI owns the version

Verify:

- [ ] `gh release list --repo <owner>/<repo>` returns a tag after the first merge

## 5. Local testing

Every plan step must pass unit **and** docker-compose level tests, including
standalone-service compose for provider repositories.

- [ ] `docker-compose.yml` present
- [ ] Provider tier additionally has its backing-service compose, e.g. `openst` has
      `docker-compose.dragonfly.yml`
- [ ] The compose stack starts standalone

## 6. Registration

- [ ] Listed in `MODULARISATION.md`
- [ ] Listed in the module list in root `AGENTS.md` if it is a backend module
- [ ] Added to the homelab cluster at
      `~/prv/homelab/homelab/cluster/apps/pfire/<name>/` if deployable, with image
      pinned in `app/helmrelease.yaml` — twice where both an app and a cronjob exist

## 7. Verification

A repository is configured when this checklist has been applied to it **from this
document alone**, without reference to prior knowledge.

---

## Known gaps

| Gap | Ticket |
|---|---|
| Issue types unavailable until repositories are org-owned | [#6](https://github.com/Marx2/portfoliost/issues/6) |
| No enforced label taxonomy or repo baseline | [#17](https://github.com/Marx2/portfoliost/issues/17) |
| Board membership is manual per repository | [#11](https://github.com/Marx2/portfoliost/issues/11) |
| Branch protection unavailable on private repos at the Free plan | [#13](https://github.com/Marx2/portfoliost/issues/13) |