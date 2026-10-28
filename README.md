# Hypo-Thesis

**Live app: https://hypo-thesis.wendyslook.workers.dev** ([mortgage check](https://hypo-thesis.wendyslook.workers.dev/mortgage))

A Swiss mortgage application check, built for Exercise 4 of Claude Build Day Zurich: upload an applicant's seven documents, Claude reads them, the Swiss rule sheet decides (20% equity of which 10% hard, yearly costs at most a third of gross income), and Claude drafts a one-page Kreditantrag for the credit officer to approve or reject. All applicant data is fictional.

`hypo-thesis` is a [Turborepo](https://turborepo.com) monorepo, managed with Bun workspaces.

## Apps

- [`apps/web`](apps/web) — the [TanStack Start](https://tanstack.com/start) front end, deployed on Cloudflare Workers, with [Cloudflare D1](https://developers.cloudflare.com/d1/) for data. See its [README](apps/web/README.md) for architecture and setup.

Auth is [Clerk](https://clerk.com): `/login` signs in, the header shows the
signed-in user.

## Packages

- [`packages/db`](packages/db) — `@repo/db`: the Drizzle schema for D1, the generated migrations, and the example `notes` table. See its [README](packages/db/README.md).
- [`packages/services`](packages/services) — `@repo/services`: the service layer. Business rules and validation, on top of `@repo/db`. The web app calls it through [tRPC](https://trpc.io). See its [README](packages/services/README.md).

## Next steps: the full process

The app covers everything the exercise requires: the worked example, extraction, all three applicants, a fix for each fail, the one-page Kreditantrag and the credit officer's sign-off. The exercise also lists six "Full process" extras that turn the check into something closer to what a bank actually runs. None of them are built yet.

Each extra below says what it is, why it's worth building (what it teaches you), where it goes in the code, and when it's done. You can work through them yourself, or hand this section to a coding agent such as Claude Code one item at a time ("Build next step 1 from the README").

### Ground rules for every step

These keep the app trustworthy as it grows. An agent should follow them without being told twice.

- **The rules decide, Claude reads and writes.** Every number and every pass/fail comes from plain, tested functions in [`packages/services/src/mortgage-rules.ts`](packages/services/src/mortgage-rules.ts). Claude extracts numbers from documents and drafts text, but it never calculates. A credit decision has to be explainable and repeatable, and a function gives the same answer every time.
- **Don't break what already works.** The worked example (CHF 1,000,000 → 58,889 yearly cost, 176,667 required income) and the three applicants' results (A1 approve at 30.7%, A2 reject on hard equity, A3 reject on affordability with 2 findings) are pinned by tests. Run `bun test` in `packages/services` after every change; those tests must stay green and unchanged.
- **The sample documents don't contain the new data.** None of the seven PDFs has a bank valuation, a partner, an expected pension or a pillar 3a account. Add the new values as clearly labelled inputs: form fields in the app, plus new fictional test applicants in [`mortgage-dossiers.ts`](packages/services/src/mortgage-dossiers.ts). Never present an invented value as if it came from a document.
- **Write down every new assumption.** The exercise's rule sheet says "use as given", and the extras go beyond it. Each new rate, limit or age goes into `RULES` with a comment saying what it is and where it comes from (for example a bank's published guidelines). Then a reviewer can check it, and changing it later is one line.

### Suggested order

The order runs from the smallest change to the biggest. Each step reuses something the one before it built.

#### 1. Use the bank's valuation, not just the price

**What:** banks lend on what the property is worth to them, not what the buyer agreed to pay. Add a bank valuation (Verkehrswert) and run every percentage on the lower of the two.

**Why it's worth building:** it's the smallest rule change, so it's a good first lesson in how the rule engine is laid out. It also teaches a real lending idea: if the buyer overpays, the bank treats the difference as extra equity the buyer has to bring, not as a bigger mortgage.

**Where:** `calculateCosts` and `checkEquity` in `mortgage-rules.ts` take a `valuation` alongside `price`. Add a valuation field to the app, and show both numbers in the Kreditantrag ([`mortgage-kreditantrag.ts`](packages/services/src/mortgage-kreditantrag.ts), `buildFacts`).

**Done when:** a test applicant whose valuation is below the price needs more equity than before, with no valuation the result is the same as today, and the old tests still pass.

#### 2. Recalculate affordability at retirement

**What:** a 15-year mortgage often outlives the paycheck. Banks check whether the costs are still at most a third of income once the applicant retires, using the expected pension (state AHV plus pension fund) instead of the salary.

**Why it's worth building:** it teaches you that one applicant can face the same rule at two points in time, with the answer changing in between. The app already uses the retirement age to shorten amortization, so this extends an idea that's already there. It also shows how to report a second check without hiding the first.

**Where:** a new `checkRetirementAffordability` in `mortgage-rules.ts`, called from `assess`. Add an "expected pension" input (the Vorsorgeausweis in a real dossier often projects it), plus a new row in the UI ([`apps/web/src/routes/mortgage.tsx`](apps/web/src/routes/mortgage.tsx)) and in the Kreditantrag.

**Done when:** the app shows a cost ratio for today and one for retirement, a test applicant who passes today but fails at retirement gets "approve with conditions" or "reject" with that reason, and the fix search in `proposeFixes` takes the new check into account.

#### 3. Pension money as equity: withdrawal or pledge

**What:** Swiss buyers can put pension fund money toward a home in two ways. A withdrawal (WEF-Vorbezug) takes the cash out, and it counts as equity but not as hard equity. A pledge (Verpfändung) leaves the money in the fund as extra security for the bank. Let the applicant choose, and show what each choice does.

**Why it's worth building:** it teaches you to model a trade-off rather than a pass/fail. A withdrawal helps the equity check today but lowers the future pension, which feeds back into step 2. A pledge keeps the pension whole, but the mortgage stays bigger. Seeing both side by side is the useful output.

**Where:** `EquityInput` in `mortgage-rules.ts` gets a `pensionUse: "withdrawal" | "pledge"`, along with the amount. The app already extracts the maximum and the requested withdrawal (`pension.maxWithdrawal`, `pension.requestedWithdrawal`), so the inputs are partly there.

**Done when:** the same applicant can be checked both ways, each result says what changed, and a withdrawal larger than `maxWithdrawal` is rejected.

#### 4. Couples: two incomes, two pension funds

**What:** many homes are bought by two people. Combine both incomes and both pension funds, run the consistency check on each person's documents, and flag a debt register entry against either of them.

**Why it's worth building:** this is the biggest change to the data shape, and it teaches you how to grow a data model without breaking the code that depends on it. The `Dossier` type goes from one person to one or more borrowers. Extraction ([`mortgage-extract.ts`](packages/services/src/mortgage-extract.ts)), the consistency check (`checkConsistency` in [`mortgage.ts`](packages/services/src/mortgage.ts)) and the Kreditantrag all have to follow. It also replaces today's rough "co-borrower" fix with a real second applicant.

**Where:** `Dossier` and `dossierSchema` in `mortgage-dossiers.ts` get a list of borrowers, and extraction gets two document sets. For retirement (step 2), use the earlier retirement date of the two.

**Done when:** a single applicant still works exactly as before, a couple's combined income passes where either person alone would fail, and each person's findings are labelled with their name.

#### 5. Direct vs indirect amortization (pillar 3a)

**What:** the second mortgage can be repaid directly (the loan shrinks every year) or indirectly (the yearly amount goes into a pillar 3a account pledged to the bank, and the loan is paid off in one go at the end). Compare the two over the repayment period.

**Why it's worth building:** it teaches you to turn rules into a projection. The affordability check doesn't change, because the yearly amount is the same either way. What changes is the total cost: with indirect amortization the interest stays higher, but 3a payments lower your taxes. It's the first step whose output is advice, not a decision.

**Where:** a new pure function, for example `compareAmortization`, in `mortgage-rules.ts`, returning a year-by-year table for both options. Ask the user for the tax rate and the yearly 3a limit, and put both in `RULES` with their source. The 3a limit changes every year, so don't hard-code it from memory.

**Done when:** the app shows both options with the total interest, the tax saved and the balance at the end, and the worked example's 8,889 per year of amortization shows up as the yearly amount in both.

#### 6. A client chat that explains the decision

**What:** a chat where the applicant asks "why was I rejected?" or "what if I put in CHF 50,000 more?" and gets a plain-language answer.

**Why it's worth building:** it's the hardest step to get right, and it's where the ground rules matter most. It teaches you how to keep a language model honest. Claude gets the finished check as data and explains it. It never works out numbers itself. For "what if" questions, it calls the rule functions as tools and reports what they return. That way the chat can never promise a mortgage the rules would refuse.

**Where:** a new service next to the Kreditantrag writer (`createKreditantragWriter` in `mortgage-kreditantrag.ts` is the pattern to copy). Use the Anthropic SDK with the rule functions as tools, a `protectedProcedure` in [`apps/web/src/server/trpc/routers/mortgage.ts`](apps/web/src/server/trpc/routers/mortgage.ts), and a chat panel in `mortgage.tsx`.

**Needs:** an `ANTHROPIC_API_KEY`. Claude features are switched off on the live demo, so build and try this locally. Before you put it online, keep it behind sign-in and set a spending limit, because every message costs money.

**Done when:** the chat explains each of A1–A3 correctly, a "what if" answer matches the numbers the app shows for the same change, and the chat refuses to change the decision or give numbers it didn't get from a tool.

## Start a new project

You need [Bun](https://bun.sh) 1.3 or newer and [Claude Code](https://claude.com/claude-code). Deploying also needs a free [Cloudflare](https://dash.cloudflare.com/sign-up) account.

1. Create your repo from the template and clone it. This makes a new private GitHub repo with a fresh history:

   ```bash
   gh repo create my-app --template codewithpassion/cf-tanstack-boilerplate --private --clone
   cd my-app
   bun install
   ```

   Without the `gh` CLI, press "Use this template" on the [template's GitHub page](https://github.com/codewithpassion/cf-tanstack-boilerplate) and clone the repo it creates.

2. Start Claude Code in that folder and type `/project-init`. It asks for a name, renames the project to it and commits. It asks whether you want Clerk auth, then signs you in to Cloudflare, creates the D1 database, applies the migrations and does the first deploy. It asks before creating anything on your account. When it finishes you have a `https://my-app.<subdomain>.workers.dev` URL. Open `/api/health` on it: `"db":"ok"` means the database works.

3. Commit what `/project-init` left uncommitted and push. That includes the D1 `database_id` in `apps/web/wrangler.jsonc`. It is not a secret, and without it a fresh clone deploys against the `"local"` placeholder.

4. Optional: run the `setup-previews` skill to get a preview deployment for every pull request. See [Pull request previews](#pull-request-previews).

After that, deploying is two commands from `apps/web`. Run the first one only when `packages/db` has a new migration:

```bash
bunx wrangler d1 migrations apply DB --remote
bun run deploy
```

No Claude Code? `bun .claude/skills/rename-project/rename.ts my-app` does the rename, and [Deploy](#deploy) below has the Cloudflare steps by hand.

## Develop

```bash
bun install
bun run dev
```

`bun run dev` applies the D1 migrations to a local database and starts the web app. The local database is SQLite, run by [Miniflare](https://developers.cloudflare.com/workers/testing/miniflare/) under the Cloudflare Vite plugin, and lives in `apps/web/.wrangler`. No account and no Docker needed. `http://localhost:3000/api/health` reports `"db":"ok"` when the database answers.

Commands at the root run across all apps via [Turborepo](https://turborepo.com):

- `bun run dev` — start all apps in dev mode
- `bun run build` — build all apps
- `bun run deploy` — build and deploy all apps
- `bun run preview` — preview production builds
- `bun run check` / `bun run fix` — lint/format the whole repo with [Ultracite](https://ultracite.ai)
- `bun run test` — run every workspace's tests

To run a command for a single app, use turbo's filter flag, e.g. `bunx turbo run dev --filter=web`, or `cd apps/web && bun run dev`.

## Deploy

Local development needs none of this. You only need the accounts below when you want the app running on the internet.

### 1. A Cloudflare account

The web app deploys to [Cloudflare Workers](https://workers.cloudflare.com). The free plan is enough. Sign in once from the terminal:

```bash
cd apps/web
bunx wrangler login
```

If you belong to more than one Cloudflare account, `wrangler deploy` will ask which one to use; set `CLOUDFLARE_ACCOUNT_ID` in `apps/web/.env.local` to skip the prompt. The Worker's name comes from `apps/web/wrangler.jsonc` (the `rename-project` skill sets it).

### 2. A D1 database

The local database only exists on your machine, so a deployed Worker needs a real [D1](https://developers.cloudflare.com/d1/) database. It is on the same free plan as the Worker:

```bash
cd apps/web
bunx wrangler d1 create bd-mortgage-fun
```

That prints a `database_id`. Put it in the `d1_databases` entry in `apps/web/wrangler.jsonc`, replacing the `"local"` placeholder, then create the tables:

```bash
bunx wrangler d1 migrations apply DB --remote
```

Repeat the `migrations apply --remote` whenever `packages/db` gains a new migration.

### 3. Ship it

```bash
bun run deploy
```

That builds and runs `wrangler deploy`. The URL is printed at the end; open `/api/health` on it and check for `"db":"ok"` to confirm the database binding.

## Pull request previews

Every pull request can get its own copy of the app, on a URL like `https://pr-42-hypo-thesis-staging.<subdomain>.workers.dev`, with its own empty D1 database that has the PR's migrations applied. Pushing to the PR updates it. Closing or merging the PR deletes the preview and the database. It uses [Cloudflare Worker Previews](https://developers.cloudflare.com/workers/previews/), which is in open beta.

Previews are off until you set them up: run the `setup-previews` skill (`.claude/skills/setup-previews`), after the Deploy steps above. Until then the workflow skips.

How it fits together:

- `env.staging` in `apps/web/wrangler.jsonc` is a second Worker, `hypo-thesis-staging`, with its own D1 database. Previews hang off it, never off production.
- Its `previews` block holds the preview's bindings. A preview inherits none from staging, so anything missing there is `undefined` at runtime. The D1 entry holds placeholders. Never commit a real id there.
- `.github/workflows/preview.yml` runs on every PR push. It builds with `CLOUDFLARE_ENV=staging`, then `apps/web/scripts/preview.ts deploy` finds or creates the PR's D1 database (`hypo-thesis-preview-pr-<N>`), applies the migrations, writes the database id into the built config in `dist/server/wrangler.json` and runs `wrangler preview`. The URL goes in a PR comment. On close, `preview.ts delete` removes both.
- PRs from forks get no preview, because they cannot read the repo's secrets.

From `apps/web`, by hand:

```bash
bun run staging:deploy          # build, migrate and deploy the staging Worker
bun run preview:deploy pr-42    # what the workflow does on push
bun run preview:delete pr-42    # what it does on close
```

Things to know:

- Preview URLs are public unless you turn on Cloudflare Access for previews.
- Secrets go in the preview base config: `bunx wrangler preview base-config secret put <NAME> --env staging`. A preview copies it once, when the preview is created. Existing previews keep the old values until you delete them and re-run the workflow.
- Pass `--env staging` to every `wrangler preview` command. Without it, `preview delete` and `preview base-config` act on the production Worker.
- Cron triggers do not fire in previews, and `wrangler tail` does not support them. Use the dashboard's observability logs.

## License

[MIT](LICENSE)
