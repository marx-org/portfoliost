# Configuring a new repository in pfire

Checklist for bringing a new `pfire` repository into `marx-org`. Every item is
checkable. Where GitHub does not provide an organization-wide default, this document
calls out the manual action instead of implying that it happens automatically.

Related: [`MODULARISATION.md`](./MODULARISATION.md) for the module tiers and
playbook naming. Root `AGENTS.md` for the release flow and step-test-commit discipline.

This is the local configuration playbook. It does not change organization settings,
repository labels, issue templates, or branch protection on its own.

---

## 1. Create the repository and decide the tier

Create the repository under `marx-org`; choose visibility deliberately. A repository
that will contain personal or production data must remain private until the security
and history audit is complete.

```sh
gh repo create marx-org/<repo> --public --description "<description>"
# Or use --private when the repository must not be public.
```

The tier determines the stack, the compose services, and whether contracts apply.

| Tier | Stack | Members |
|---|---|---|
| Provider | Python + `requirements.txt` | `openst`, `cachest` |
| Module | Hono + Drizzle + Postgres + PGLite + jose | `portfoliost-users-auth`, `portfoliost-instruments`, `portfoliost-wallets`, `portfoliost-admin` |
| Contracts | OpenAPI spec only, no runtime | `portfoliost-contracts` |
| App | Vue + Vite | `portfoliost` |

- [ ] Tier decided and recorded in `MODULARISATION.md`.
- [ ] Repository visibility recorded with the decision.

## 2. GitHub configuration

### Board membership
The `pfire` Projects v2 board is owned by `marx-org`. Repository ownership does not
automatically add issues to it, and there is no repository setting that links all
future issues to the board. Add every root issue explicitly; native sub-issues inherit
membership from their parent.

From the pfire root:

```sh
bash .pi/skills/board/board.sh add \
  https://github.com/marx-org/<repo>/issues/<number> Task
```

- [ ] Root issues are added to `marx-org/pfire` with a native type.
- [ ] Dependencies use the board's `blocked by` relation, not title numbering.

### Issue types
`Task`, `Bug`, and `Feature` are organization-provided native issue types. They work
on repositories owned by `marx-org`; the old user-owned-repository limitation no longer
applies. Use the type as the issue's primary classification and verify the write:

```sh
gh issue create --repo marx-org/<repo> \
  --title "<title>" --type Task --body "<body>"
gh issue view <number> --repo marx-org/<repo> --json issueType
```

The project board requires every issue to have a type. `gh api repos/marx-org/<repo>/issue-types`
lists the available type IDs, but an actual issue read-back is the proof that assignment
worked.

- [ ] Every root issue has `Task`, `Bug`, or `Feature` assigned.
- [ ] Issue type is verified after creation or update.

### Labels
Labels are secondary metadata; native issue types are authoritative. Use GitHub's
standard labels (`bug`, `documentation`, `duplicate`, `enhancement`, `good first issue`,
`help wanted`, `invalid`, `question`, and `wontfix`) for their documented meanings.
Add a narrowly scoped `area:*` label only when the repository has a durable surface that
needs filtering. Do not create `type:*` labels to mirror native issue types.

The standard labels are repository defaults, not an enforced organization policy. A
repository-specific label or taxonomy therefore belongs in that repository's own
documentation and setup PR.

- [ ] Labels used by the repository follow the meanings above.
- [ ] No `type:*` mirror labels are introduced while native issue types are available.

### Issue forms and templates

GitHub does not apply a local issue form or pull-request template merely because a
repository belongs to `marx-org`. If a repository needs one, add it under
`.github/ISSUE_TEMPLATE/` or `.github/pull_request_template.md` in the same PR that
creates the repository. Keep the form's native `type` and label choices consistent with
the rules above.

- [ ] Required repository-specific issue forms/templates are committed.
- [ ] Blank issues remain available unless the repository deliberately requires forms.

### Branch protection
- [ ] `main` is protected where the repository's visibility and plan allow it.

On GitHub Free, branch protection is available for public repositories. Applying it to a
private repository requires the appropriate paid plan. Record the limitation rather than
pretending the setting was applied.

## 3. Contracts

Only for Module-tier repositories and the app.

- [ ] `@marx-org/contracts` in dependencies.
- [ ] `.npmrc` contains `@marx-org:registry=https://npm.pkg.github.com`.
- [ ] `gen:types` script points at the **local** spec in the installed package:
  ```
  # module tier
  openapi-typescript node_modules/@marx-org/contracts/openapi.yaml -o src/generated/api-types.d.ts
  # app
  openapi-typescript node_modules/@marx-org/contracts/openapi.yaml -o generated/api-types.d.ts
  ```
- [ ] Generated types are committed.
- [ ] Import types via `components["schemas"]["..."]` — never redeclare a shape locally.

To consume a new contracts version:

- [ ] `gh release list --repo marx-org/portfoliost-contracts` — the version is written by CI, never by hand.
- [ ] `NODE_AUTH_TOKEN=$(gh auth token) npm install @marx-org/contracts@<version>`.
- [ ] `npm run gen:types`.
- [ ] Commit `package-lock.json` and regenerated types.

## 4. GHA image build

Every deployable repository publishes to `ghcr.io/marx-org/<repo>` through the dynamic
`${{ github.repository }}` workflow path.

- [ ] `.github/workflows/docker-image.yml` is present and active.
- [ ] It builds on push to `main` and publishes on merge to `main`.
- [ ] `APP_VERSION` is wired from the release job output:
  ```
  APP_VERSION=${{ needs.release.outputs.version }}
  ```
- [ ] The workflow grants `packages: write` to `GITHUB_TOKEN` or documents the required registry secret.
- [ ] Images are never tagged manually — CI owns the version.

Verify after the first merge:

- [ ] `gh release list --repo marx-org/<repo>` returns a CI-created tag.
- [ ] The matching image exists under `ghcr.io/marx-org/<repo>`.

## 5. Local testing

Every plan step must pass unit **and** docker-compose-level tests, including standalone
service compose for provider repositories.

- [ ] `docker-compose.yml` is present.
- [ ] Provider tier additionally has its backing-service compose, for example
      `docker-compose.dragonfly.yml`
- [ ] The compose stack starts standalone.
- [ ] Unit, mock, and e2e/build checks required by the repository's `AGENTS.md` pass.

## 6. Registration

- [ ] Listed in `MODULARISATION.md`.
- [ ] Listed in root `AGENTS.md` if it is a backend module.
- [ ] Added to the homelab cluster at
      `~/prv/homelab/homelab/cluster/apps/pfire/<name>/` if deployable, with image
      pinned in `app/helmrelease.yaml` — twice where both an app and a cronjob exist.
- [ ] Release, image, and Flux read-back are recorded before calling the repository ready.

## 7. Verification

A repository is configured when this checklist has been applied to it **from this
document alone**, without reference to prior knowledge. The checks below are the
minimum read-back evidence:

```sh
gh repo view marx-org/<repo> --json nameWithOwner,visibility,defaultBranchRef
gh api repos/marx-org/<repo>/issue-types
gh issue view <number> --repo marx-org/<repo> --json issueType
gh release list --repo marx-org/<repo>
```

The former project-level configuration gap tracked by
[`pfire-docs#4`](https://github.com/marx-org/pfire-docs/issues/4) is resolved by this
playbook: the remaining non-automatic settings are named, and each has a checkable
repository-local action.

---

## Known non-automatic settings

| Setting | Current behavior |
|---|---|
| Board membership | Manual root-issue add through `board.sh`; sub-issues inherit membership. |
| Custom labels | No custom organization taxonomy is enforced; use native types plus the documented standard labels. |
| Issue forms/templates | Repository-local files are required when forms or templates are needed. |
| Branch protection | Available for public repositories on GitHub Free; private repositories need the appropriate paid plan. |
