import {
  createFileRoute,
  type ErrorComponentProps,
  Link,
} from "@tanstack/react-router";
import type { inferRouterOutputs } from "@trpc/server";
import { useCallback, useState } from "react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table";
import { getTrpc } from "#/integrations/trpc/client";
import type { AppRouter } from "#/server/trpc/router";

type Outputs = inferRouterOutputs<AppRouter>["mortgage"];
type Check = Outputs["check"];
type Costs = Outputs["workedExample"];
type Outcome = Check["decision"]["outcome"];

const DEFAULT_APPLICANT = "A1";

export const Route = createFileRoute("/mortgage")({
  // Optional so plain links to /mortgage work; no applicant means A1.
  validateSearch: (search: Record<string, unknown>): { applicant?: string } =>
    typeof search.applicant === "string" ? { applicant: search.applicant } : {},
  loaderDeps: ({ search }) => ({
    applicant: search.applicant ?? DEFAULT_APPLICANT,
  }),
  loader: async ({ deps }) => {
    const trpc = getTrpc();
    const [applicants, check, workedExample] = await Promise.all([
      trpc.mortgage.list.query(),
      trpc.mortgage.check.query({ id: deps.applicant }),
      trpc.mortgage.workedExample.query(),
    ]);
    return { applicants, check, workedExample };
  },
  component: MortgagePage,
  errorComponent: MortgageError,
});

const THOUSANDS = /\B(?=(\d{3})+(?!\d))/g;

// Same output on the Worker and in the browser, unlike toLocaleString().
function chf(amount: number): string {
  return `CHF ${Math.round(amount).toString().replace(THOUSANDS, "'")}`;
}

function percent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

const OUTCOME_LABEL: Record<Outcome, string> = {
  approve: "Approve",
  "approve-with-conditions": "Approve with conditions",
  reject: "Reject",
};

const OUTCOME_VARIANT: Record<
  Outcome,
  "default" | "destructive" | "secondary"
> = {
  approve: "default",
  "approve-with-conditions": "secondary",
  reject: "destructive",
};

function MortgagePage() {
  const { applicants, check, workedExample } = Route.useLoaderData();

  return (
    <main className="page-wrap px-4 py-12">
      <section className="max-w-3xl">
        <p className="island-kicker mb-3">Exercise 4</p>
        <h1 className="display-title mb-4 text-4xl text-foreground sm:text-5xl">
          Mortgage application check
        </h1>
        <p className="m-0 max-w-3xl text-base text-muted-foreground leading-8">
          Seven documents per applicant, checked against the Swiss rule sheet:
          20% equity of which 10% hard equity, and yearly costs (5% imputed
          interest, 1% maintenance, amortization of the second mortgage) at most
          a third of gross income. The rules decide; the credit officer signs
          off.
        </p>
      </section>

      <nav aria-label="Applicants" className="mt-8 flex flex-wrap gap-2">
        {applicants.map((applicant) => (
          <Button
            asChild
            key={applicant.id}
            variant={applicant.id === check.dossier.id ? "default" : "outline"}
          >
            <Link search={{ applicant: applicant.id }} to="/mortgage">
              {applicant.id} {applicant.name}
              <Badge
                className="ml-2"
                variant={OUTCOME_VARIANT[applicant.outcome]}
              >
                {OUTCOME_LABEL[applicant.outcome]}
              </Badge>
            </Link>
          </Button>
        ))}
      </nav>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <ExtractedNumbers check={check} />
        <Checks check={check} />
        <Findings check={check} />
        <DecisionPanel check={check} />
      </div>

      <KreditantragPanel check={check} key={check.dossier.id} />

      <WorkedExample costs={workedExample} />
    </main>
  );
}

function Panel({
  children,
  kicker,
  title,
}: {
  children: React.ReactNode;
  kicker: string;
  title: string;
}) {
  return (
    <section className="island-shell p-6">
      <p className="island-kicker mb-2">{kicker}</p>
      <h2 className="mt-0 mb-4 text-foreground text-xl">{title}</h2>
      {children}
    </section>
  );
}

function ExtractedNumbers({ check }: { check: Check }) {
  return (
    <Panel kicker="Step 2: Extract" title="Numbers from the documents">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead className="text-right">Value</TableHead>
            <TableHead>Source</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {check.extraction.values.map((item) => (
            <TableRow key={item.label}>
              <TableCell>{item.label}</TableCell>
              <TableCell className="text-right tabular-nums">
                {item.kind === "chf" ? chf(Number(item.value)) : item.value}
              </TableCell>
              <TableCell className="text-muted-foreground text-xs">
                {check.documents[item.source]}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Panel>
  );
}

function CheckRow({
  label,
  passed,
  value,
}: {
  label: string;
  passed: boolean;
  value: string;
}) {
  return (
    <TableRow>
      <TableCell>{label}</TableCell>
      <TableCell className="text-right tabular-nums">{value}</TableCell>
      <TableCell>
        <Badge variant={passed ? "default" : "destructive"}>
          {passed ? "Pass" : "Fail"}
        </Badge>
      </TableCell>
    </TableRow>
  );
}

function Checks({ check }: { check: Check }) {
  const { equity, affordability, costs } = check.assessment;
  return (
    <Panel kicker="Steps 5–6: Rules" title="Equity and affordability">
      <Table>
        <TableBody>
          <CheckRow
            label="Equity ≥ 20%"
            passed={equity.totalEquityPassed}
            value={`${chf(equity.equity)} (${percent(equity.equityShare)})`}
          />
          <CheckRow
            label="Hard equity ≥ 10%"
            passed={equity.hardEquityPassed}
            value={`${chf(equity.hardEquity)} (${percent(equity.hardEquityShare)})`}
          />
          <CheckRow
            label="Cost ratio ≤ 33.3%"
            passed={affordability.passed}
            value={percent(affordability.costRatio)}
          />
        </TableBody>
      </Table>
      <CostTable costs={costs} />
    </Panel>
  );
}

function CostTable({ costs }: { costs: Costs }) {
  const rows: [string, number][] = [
    ["Mortgage", costs.mortgage],
    ["First mortgage (up to ⅔)", costs.firstMortgage],
    ["Second mortgage", costs.secondMortgage],
    ["Interest 5%", costs.interest],
    ["Maintenance 1%", costs.maintenance],
    [`Amortization ÷ ${costs.amortizationYears} years`, costs.amortization],
    ["Total yearly cost", costs.yearlyCost],
    ["Required gross income (× 3)", costs.requiredIncome],
  ];
  return (
    <Table className="mt-4">
      <TableBody>
        {rows.map(([label, amount]) => (
          <TableRow key={label}>
            <TableCell>{label}</TableCell>
            <TableCell className="text-right tabular-nums">
              {chf(amount)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function Findings({ check }: { check: Check }) {
  return (
    <Panel
      kicker="Step 4: Consistency"
      title={`${check.findings.length} finding${check.findings.length === 1 ? "" : "s"}`}
    >
      {check.findings.length === 0 ? (
        <p className="m-0 text-muted-foreground text-sm">
          All seven documents agree with each other and the debt enforcement
          register is clean.
        </p>
      ) : (
        <ul className="m-0 list-none space-y-4 p-0">
          {check.findings.map((finding) => (
            <li className="border-border border-t pt-3" key={finding.title}>
              <p className="m-0 font-semibold text-foreground">
                {finding.title}
              </p>
              <p className="m-0 text-muted-foreground text-sm">
                {finding.detail}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function DecisionPanel({ check }: { check: Check }) {
  const { decision } = check;
  return (
    <Panel
      kicker="Step 7: Decision proposal"
      title={OUTCOME_LABEL[decision.outcome]}
    >
      <ul className="m-0 space-y-2 pl-5 text-sm">
        {decision.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
      {decision.fixes.length > 0 ? (
        <>
          <h3 className="mt-5 mb-2 text-base text-foreground">
            What would make it pass
          </h3>
          <ul className="m-0 space-y-2 pl-5 text-sm">
            {decision.fixes.map((fix) => (
              <li key={fix.kind}>{fix.description}</li>
            ))}
          </ul>
        </>
      ) : null}
      {decision.conditions.length > 0 ? (
        <>
          <h3 className="mt-5 mb-2 text-base text-foreground">Conditions</h3>
          <ul className="m-0 space-y-2 pl-5 text-sm">
            {decision.conditions.map((condition) => (
              <li key={condition}>{condition}</li>
            ))}
          </ul>
        </>
      ) : null}
    </Panel>
  );
}

type Signoff = "approved" | "pending" | "rejected";

function KreditantragPanel({ check }: { check: Check }) {
  const { kreditantrag } = check;
  // Local only: the sign-off is the human step and is not persisted.
  const [signoff, setSignoff] = useState<Signoff>("pending");
  const approve = useCallback(() => setSignoff("approved"), []);
  const reject = useCallback(() => setSignoff("rejected"), []);
  const reset = useCallback(() => setSignoff("pending"), []);

  return (
    <section className="island-shell mt-6 p-6 sm:p-8">
      <p className="island-kicker mb-2">Step 8: Draft Kreditantrag</p>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 text-2xl text-foreground">{kreditantrag.title}</h2>
        <span className="text-muted-foreground text-sm">
          {kreditantrag.date}
        </span>
      </div>
      <div className="mt-4 grid gap-x-8 gap-y-4 md:grid-cols-2">
        {kreditantrag.sections.map((section) => (
          <div key={section.heading}>
            <h3 className="mt-0 mb-1 text-base text-foreground">
              {section.heading}
            </h3>
            <dl className="m-0 grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-3 gap-y-1 text-sm">
              {section.rows.map((row) => (
                <div className="contents" key={`${row.label}-${row.value}`}>
                  <dt className="text-muted-foreground">{row.label}</dt>
                  <dd className="m-0">{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
      <p className="mt-6 mb-0 text-sm">
        <strong>Empfehlung:</strong> {kreditantrag.recommendation}
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3 border-border border-t pt-4">
        <span className="island-kicker">Step 9: Credit officer</span>
        {signoff === "pending" ? (
          <>
            <Button onClick={approve}>Approve</Button>
            <Button onClick={reject} variant="destructive">
              Reject
            </Button>
          </>
        ) : (
          <>
            <Badge variant={signoff === "approved" ? "default" : "destructive"}>
              {signoff === "approved" ? "Approved" : "Rejected"} by credit
              officer
            </Badge>
            <Button onClick={reset} size="sm" variant="ghost">
              Undo
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

function WorkedExample({ costs }: { costs: Costs }) {
  return (
    <section className="island-shell mt-6 max-w-xl p-6">
      <p className="island-kicker mb-2">Rule sheet</p>
      <h2 className="mt-0 mb-1 text-foreground text-xl">Worked example</h2>
      <p className="m-0 text-muted-foreground text-sm">
        Purchase price {chf(costs.price)} with 20% equity ({chf(costs.equity)}).
      </p>
      <CostTable costs={costs} />
    </section>
  );
}

function MortgageError({ error }: ErrorComponentProps) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <main className="page-wrap px-4 py-12">
      <section className="island-shell max-w-3xl p-6 sm:p-8">
        <h1 className="display-title mb-4 text-3xl text-foreground">
          Could not run the mortgage check
        </h1>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
          {message}
        </pre>
        <Button asChild className="mt-4" variant="outline">
          <Link search={{ applicant: DEFAULT_APPLICANT }} to="/mortgage">
            Back to applicant {DEFAULT_APPLICANT}
          </Link>
        </Button>
      </section>
    </main>
  );
}
