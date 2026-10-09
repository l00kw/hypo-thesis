import {
  createFileRoute,
  type ErrorComponentProps,
  Link,
} from "@tanstack/react-router";
import { TRPCClientError } from "@trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import { type ChangeEvent, useCallback, useEffect, useState } from "react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
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
type Analysis = Outputs["analyze"];
type Draft = Outputs["draftKreditantrag"];
type Decision = inferRouterOutputs<AppRouter>["decisions"]["record"];
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
  const { applicants, check: builtIn, workedExample } = Route.useLoaderData();
  const [uploaded, setUploaded] = useState<Check | null>(null);
  const [showUploaded, setShowUploaded] = useState(false);
  // Each upload gets a fresh Kreditantrag panel, so a sign-off or a draft
  // never carries over from the previous applicant.
  const [uploadCount, setUploadCount] = useState(0);
  const handleUploaded = useCallback((result: Check) => {
    setUploaded(result);
    setUploadCount((count) => count + 1);
    setShowUploaded(true);
  }, []);
  const showBuiltIn = useCallback(() => setShowUploaded(false), []);
  const showUpload = useCallback(() => setShowUploaded(true), []);
  const check = showUploaded && uploaded ? uploaded : builtIn;

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

      <UploadPanel onResult={handleUploaded} />

      <nav aria-label="Applicants" className="mt-8 flex flex-wrap gap-2">
        {uploaded ? (
          <Button
            onClick={showUpload}
            variant={check === uploaded ? "default" : "outline"}
          >
            Uploaded: {uploaded.dossier.application.name}
            <Badge
              className="ml-2"
              variant={OUTCOME_VARIANT[uploaded.decision.outcome]}
            >
              {OUTCOME_LABEL[uploaded.decision.outcome]}
            </Badge>
          </Button>
        ) : null}
        {applicants.map((applicant) => (
          <Button
            asChild
            key={applicant.id}
            variant={
              check === builtIn && applicant.id === builtIn.dossier.id
                ? "default"
                : "outline"
            }
          >
            <Link
              onClick={showBuiltIn}
              search={{ applicant: applicant.id }}
              to="/mortgage"
            >
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

      <KreditantragPanel
        check={check}
        key={check === uploaded ? `upload-${uploadCount}` : check.dossier.id}
      />

      <WorkedExample costs={workedExample} />
    </main>
  );
}

// btoa needs a binary string; build it in chunks so large PDFs don't overflow
// the argument limit of String.fromCharCode.
const BASE64_CHUNK = 0x80_00;

async function toBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const parts: string[] = [];
  for (let start = 0; start < bytes.length; start += BASE64_CHUNK) {
    parts.push(
      String.fromCharCode(...bytes.subarray(start, start + BASE64_CHUNK))
    );
  }
  return btoa(parts.join(""));
}

type UploadState =
  | { kind: "error"; message: string }
  | { kind: "idle" }
  | { kind: "incomplete"; result: Extract<Analysis, { status: "incomplete" }> }
  | { kind: "reading" };

function UploadPanel({ onResult }: { onResult: (check: Check) => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [state, setState] = useState<UploadState>({ kind: "idle" });

  const handleFiles = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setFiles(Array.from(event.target.files ?? []));
    setState({ kind: "idle" });
  }, []);

  const handleAnalyze = useCallback(async () => {
    setState({ kind: "reading" });
    try {
      const encoded = await Promise.all(
        files.map(async (file) => ({
          data: await toBase64(file),
          name: file.name,
        }))
      );
      const result = await getTrpc().mortgage.analyze.mutate({
        files: encoded,
      });
      if (result.status === "incomplete") {
        setState({ kind: "incomplete", result });
        return;
      }
      setState({ kind: "idle" });
      onResult(result.check);
    } catch (err) {
      setState({
        kind: "error",
        message:
          err instanceof Error
            ? err.message
            : "The documents could not be read.",
      });
    }
  }, [files, onResult]);

  const reading = state.kind === "reading";

  return (
    <section className="island-shell mt-8 p-6">
      <p className="island-kicker mb-2">
        Steps 1–3: Receive, extract, complete
      </p>
      <h2 className="mt-0 mb-2 text-foreground text-xl">Upload a dossier</h2>
      <p className="mt-0 mb-4 text-muted-foreground text-sm">
        Select the applicant&apos;s seven PDFs. Claude reads them and copies
        each document&apos;s numbers; the checks below stay in code.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="sr-only" htmlFor="dossier-files">
          Dossier PDFs
        </label>
        <input
          accept="application/pdf"
          className="text-sm"
          disabled={reading}
          id="dossier-files"
          multiple
          onChange={handleFiles}
          type="file"
        />
        <Button
          disabled={reading || files.length === 0}
          onClick={handleAnalyze}
        >
          {reading
            ? `Reading ${files.length} document${files.length === 1 ? "" : "s"}…`
            : "Check documents"}
        </Button>
      </div>
      {reading ? (
        <p className="mt-3 mb-0 text-muted-foreground text-sm" role="status">
          Claude is reading the documents. This takes up to a minute.
        </p>
      ) : null}
      {state.kind === "error" ? (
        <p className="mt-3 mb-0 text-destructive text-sm" role="alert">
          {state.message}
        </p>
      ) : null}
      {state.kind === "incomplete" ? (
        <div className="mt-4" role="alert">
          <p className="m-0 font-semibold text-foreground">
            The dossier is incomplete. Request these documents from the
            applicant:
          </p>
          <ul className="mt-2 mb-0 pl-5 text-sm">
            {state.result.missingLabels.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
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

const DECISION_LABEL: Record<Decision["decision"], string> = {
  approved: "Genehmigt durch Kreditoffizier",
  rejected: "Abgelehnt durch Kreditoffizier",
};

type DraftState =
  | { kind: "drafting" }
  | { kind: "error"; message: string }
  | { kind: "none" }
  | { draft: Draft; kind: "ready" };

const UPLOADED_ID = "UP";

/** The decision as the rules made it, in the Kreditantrag's language. */
const OUTCOME_LABEL_DE: Record<Outcome, string> = {
  approve: "Genehmigen",
  "approve-with-conditions": "Genehmigen mit Auflagen",
  reject: "Ablehnen",
};

/** Built-in applicants by id; an upload is sent back and re-checked on the server. */
function draftInput(check: Check) {
  return check.dossier.id === UPLOADED_ID
    ? { dossier: check.dossier }
    : { id: check.dossier.id };
}

function swissDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}.${month}.${year}`;
}

function printPage() {
  window.print();
}

function TemplateOverview({ check }: { check: Check }) {
  const { kreditantrag } = check;
  return (
    <>
      <h3 className="mt-6 mb-2 text-base text-foreground">Übersicht</h3>
      <div className="grid gap-x-8 gap-y-4 md:grid-cols-2 print:grid-cols-2">
        {kreditantrag.sections.map((section) => (
          <div key={section.heading}>
            <h4 className="mt-0 mb-1 font-semibold text-foreground text-sm">
              {section.heading}
            </h4>
            <dl className="m-0 grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-3 gap-y-1 text-xs">
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
    </>
  );
}

function figureStatus(passed: boolean): string {
  return passed ? "erfüllt" : "nicht erfüllt";
}

/** The figures under the AI text: all from the checks, none from Claude. */
function KeyFigures({ check }: { check: Check }) {
  const { costs, equity, affordability } = check.assessment;
  const rows: { label: string; status?: boolean; value: string }[] = [
    { label: "Kaufpreis", value: chf(costs.price) },
    {
      label: "Hypothek (1. / 2.)",
      value: `${chf(costs.mortgage)} (${chf(costs.firstMortgage)} / ${chf(costs.secondMortgage)})`,
    },
    {
      label: "Eigenmittel ≥ 20%",
      status: equity.totalEquityPassed,
      value: `${chf(equity.equity)} (${percent(equity.equityShare)})`,
    },
    {
      label: "davon hart ≥ 10%",
      status: equity.hardEquityPassed,
      value: `${chf(equity.hardEquity)} (${percent(equity.hardEquityShare)})`,
    },
    { label: "Jahreskosten", value: chf(costs.yearlyCost) },
    {
      label: "Bruttolohn (Lohnausweis)",
      value: chf(affordability.grossIncome),
    },
    {
      label: "Tragbarkeit ≤ 33.3%",
      status: affordability.passed,
      value: percent(affordability.costRatio),
    },
    { label: "Befunde", value: String(check.findings.length) },
  ];
  return (
    <>
      <h3 className="mt-5 mb-2 text-base text-foreground">
        Kennzahlen (aus der Prüfung)
      </h3>
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs sm:grid-cols-[auto_1fr_auto_1fr] print:grid-cols-[auto_1fr_auto_1fr]">
        {rows.map((row) => (
          <div className="contents" key={row.label}>
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="m-0">
              {row.value}
              {row.status === undefined ? null : (
                <span
                  className={row.status ? "" : "font-semibold text-destructive"}
                >
                  {` · ${figureStatus(row.status)}`}
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}

function KreditantragPanel({ check }: { check: Check }) {
  const { kreditantrag } = check;

  const [draft, setDraft] = useState<DraftState>({ kind: "none" });
  const handleDraft = useCallback(async () => {
    setDraft({ kind: "drafting" });
    try {
      const result = await getTrpc().mortgage.draftKreditantrag.mutate(
        draftInput(check)
      );
      setDraft({ draft: result, kind: "ready" });
    } catch (err) {
      setDraft({
        kind: "error",
        message: err instanceof Error ? err.message : "The draft failed.",
      });
    }
  }, [check]);

  const drafting = draft.kind === "drafting";

  return (
    <section className="island-shell mt-6 p-6 sm:p-8" id="kreditantrag">
      <p className="island-kicker mb-2 print:hidden">
        Step 8: Draft Kreditantrag
      </p>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 text-2xl text-foreground">{kreditantrag.title}</h2>
        <span className="text-muted-foreground text-sm">
          Stand {swissDate(kreditantrag.date)}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 print:hidden">
        <Button disabled={drafting} onClick={handleDraft}>
          {drafting && "Claude is writing…"}
          {!drafting && draft.kind === "ready" && "Redraft with Claude"}
          {!drafting && draft.kind !== "ready" && "Draft with Claude"}
        </Button>
        <Button onClick={printPage} variant="outline">
          Print / save as PDF
        </Button>
        <span className="text-muted-foreground text-xs">
          Claude writes the text; every number in it is filled in from the
          checks.
        </span>
      </div>
      {draft.kind === "error" ? (
        <p
          className="mt-3 mb-0 text-destructive text-sm print:hidden"
          role="alert"
        >
          {draft.message}
        </p>
      ) : null}

      {draft.kind === "ready" ? (
        <div className="mt-5 space-y-3">
          {draft.draft.sections.map((section) => (
            <div key={section.heading}>
              <h3 className="mt-0 mb-1 text-base text-foreground">
                {section.heading}
              </h3>
              <p className="m-0 text-sm leading-6">{section.text}</p>
            </div>
          ))}
        </div>
      ) : null}

      {draft.kind === "ready" ? (
        <KeyFigures check={check} />
      ) : (
        <TemplateOverview check={check} />
      )}
      <p className="mt-4 mb-0 text-sm">
        <strong>Empfehlung gemäss Prüfung:</strong>{" "}
        {draft.kind === "ready"
          ? OUTCOME_LABEL_DE[draft.draft.outcome]
          : kreditantrag.recommendation}
      </p>

      <SignOff check={check} />
    </section>
  );
}

type SignOffState =
  | { history: Decision[]; kind: "ready" }
  | { kind: "error"; message: string }
  | { kind: "loading" }
  | { kind: "signed-out" };

const isUnauthorized = (err: unknown): boolean =>
  err instanceof TRPCClientError && err.data?.code === "UNAUTHORIZED";

// Same output on the Worker and in the browser: the ISO string, trimmed.
function decisionTime(iso: string): string {
  const [date = "", time = ""] = iso.split("T");
  return `${swissDate(date)}, ${time.slice(0, 5)} UTC`;
}

/** A decision against the rules' proposal: approving a reject, or rejecting an approve. */
function overrulesRules(decision: Decision): boolean {
  const rulesApprove = decision.proposedOutcome !== "reject";
  return (decision.decision === "approved") !== rulesApprove;
}

function CurrentDecision({ decision }: { decision: Decision | undefined }) {
  if (!decision) {
    return <p className="m-0 text-sm">Entscheid Kreditoffizier: ausstehend</p>;
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge
        variant={decision.decision === "approved" ? "default" : "destructive"}
      >
        {DECISION_LABEL[decision.decision]}
      </Badge>
      <span className="text-muted-foreground text-xs">
        {decisionTime(decision.createdAt)} ·{" "}
        {decision.byYou ? "von Ihnen" : "von einem anderen Kreditoffizier"}
        {overrulesRules(decision) ? " · abweichend von der Empfehlung" : ""}
      </span>
      {decision.note ? (
        <p className="m-0 w-full text-sm">Bemerkung: {decision.note}</p>
      ) : null}
    </div>
  );
}

function EarlierDecisions({ decisions }: { decisions: Decision[] }) {
  if (decisions.length === 0) {
    return null;
  }
  return (
    <details className="mt-3 text-xs print:hidden">
      <summary className="cursor-pointer text-muted-foreground">
        Earlier decisions ({decisions.length})
      </summary>
      <ul className="mt-2 mb-0 space-y-1 pl-4">
        {decisions.map((entry) => (
          <li key={entry.id}>
            {DECISION_LABEL[entry.decision]} · {decisionTime(entry.createdAt)}
            {entry.byYou ? " · von Ihnen" : ""}
            {entry.note ? ` · ${entry.note}` : ""}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Step 9: the stored decision. Only signed-in users can see or record it. */
function SignOff({ check }: { check: Check }) {
  const [state, setState] = useState<SignOffState>({ kind: "loading" });
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getTrpc()
      .decisions.list.query({ target: draftInput(check) })
      .then((history) => {
        if (!cancelled) {
          setState({ history, kind: "ready" });
        }
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }
        setState(
          isUnauthorized(err)
            ? { kind: "signed-out" }
            : {
                kind: "error",
                message:
                  err instanceof Error
                    ? err.message
                    : "Could not load decisions.",
              }
        );
      });
    return () => {
      cancelled = true;
    };
  }, [check]);

  const decide = useCallback(
    async (decision: Decision["decision"]) => {
      setSaving(true);
      setSaveError(null);
      try {
        const stored = await getTrpc().decisions.record.mutate({
          decision,
          note: note.trim() || undefined,
          target: draftInput(check),
        });
        setNote("");
        setState((previous) => ({
          history: [
            stored,
            ...(previous.kind === "ready" ? previous.history : []),
          ],
          kind: "ready",
        }));
      } catch (err) {
        if (isUnauthorized(err)) {
          setState({ kind: "signed-out" });
        } else {
          setSaveError(err instanceof Error ? err.message : "Could not save.");
        }
      } finally {
        setSaving(false);
      }
    },
    [check, note]
  );
  const approve = useCallback(() => decide("approved"), [decide]);
  const reject = useCallback(() => decide("rejected"), [decide]);
  const handleNote = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setNote(event.target.value),
    []
  );

  const current = state.kind === "ready" ? state.history[0] : undefined;
  const earlier = state.kind === "ready" ? state.history.slice(1) : [];

  return (
    <div className="mt-6 border-border border-t pt-4">
      <p className="island-kicker mb-2 print:hidden">Step 9: Credit officer</p>

      <CurrentDecision decision={current} />

      {state.kind === "loading" ? (
        <p className="mt-2 mb-0 text-muted-foreground text-xs print:hidden">
          Loading decisions…
        </p>
      ) : null}
      {state.kind === "error" ? (
        <p
          className="mt-2 mb-0 text-destructive text-sm print:hidden"
          role="alert"
        >
          {state.message}
        </p>
      ) : null}
      {state.kind === "signed-out" ? (
        <p className="mt-2 mb-0 text-sm print:hidden">
          <Link className="underline" to="/login">
            Sign in
          </Link>{" "}
          to approve or reject. Decisions are stored with who made them.
        </p>
      ) : null}

      {state.kind === "ready" ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center print:hidden">
          <label className="sr-only" htmlFor="decision-note">
            Note (optional)
          </label>
          <Input
            disabled={saving}
            id="decision-note"
            maxLength={500}
            onChange={handleNote}
            placeholder="Note (optional)"
            value={note}
          />
          <Button disabled={saving} onClick={approve}>
            {current ? "Approve instead" : "Approve"}
          </Button>
          <Button disabled={saving} onClick={reject} variant="destructive">
            {current ? "Reject instead" : "Reject"}
          </Button>
        </div>
      ) : null}
      {saveError ? (
        <p
          className="mt-2 mb-0 text-destructive text-sm print:hidden"
          role="alert"
        >
          {saveError}
        </p>
      ) : null}

      <EarlierDecisions decisions={earlier} />
    </div>
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
