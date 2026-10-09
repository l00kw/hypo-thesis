import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "#/components/ui/button";

export const Route = createFileRoute("/")({ component: App });

const steps = [
  {
    title: "Reads the documents",
    description:
      "Upload an applicant's seven PDFs. Claude reads salary, assets, pension, debts and the price, and lists anything missing.",
  },
  {
    title: "Applies the Swiss rules",
    description:
      "20% equity, 10% of it hard equity, and yearly costs at most a third of gross income. The rule sheet decides, in tested code.",
  },
  {
    title: "Finds what disagrees",
    description:
      "Stated income against the salary certificate, entries in the debt register: every mismatch between documents is flagged.",
  },
  {
    title: "Drafts the Kreditantrag",
    description:
      "A one-page credit proposal with the decision and what would make it pass. A credit officer approves or rejects.",
  },
] as const;

function App() {
  return (
    <main className="page-wrap px-4 pt-14 pb-8">
      <section className="rise-in pt-6 pb-4 sm:pt-10">
        <p className="island-kicker mb-4">Swiss mortgage application check</p>
        <h1 className="display-title mb-5 max-w-3xl text-5xl text-foreground leading-[1.05] sm:text-6xl">
          Hypo-Thesis
        </h1>
        <p className="mb-8 max-w-2xl text-base text-muted-foreground sm:text-lg">
          Every mortgage application is a hypothesis: this buyer can afford this
          home. Hypo-Thesis tests it. Documents in, Swiss rules applied, a
          decision proposed with its reasons, in under a minute instead of days.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/mortgage">Open the mortgage check</Link>
          </Button>
        </div>
      </section>

      <section className="mt-14 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map(({ title, description }, index) => (
          <article
            className="rise-in border-border border-t pt-5"
            key={title}
            style={{ animationDelay: `${index * 90 + 80}ms` }}
          >
            <p className="island-kicker mb-2">
              {String(index + 1).padStart(2, "0")}
            </p>
            <h2 className="mb-2 font-heading text-2xl text-foreground leading-tight">
              {title}
            </h2>
            <p className="m-0 text-muted-foreground text-sm">{description}</p>
          </article>
        ))}
      </section>

      <p className="mt-14 mb-0 text-muted-foreground text-xs">
        Built for Exercise 4 of Claude Build Day Zurich. All applicants,
        documents and institutions are fictional.
      </p>
    </main>
  );
}
