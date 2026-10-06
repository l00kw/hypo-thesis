// The Swiss mortgage rule sheet (Exercise 4), as pure functions. No database
// and no env: the numbers depend only on the inputs, so tests pin them down.
// Amounts stay unrounded here; round with `roundChf` only for display.

export const RULES = {
  /** The first mortgage covers up to two thirds and is never repaid. */
  firstMortgageShare: 2 / 3,
  /** Kalkulatorischer Zins on the full mortgage. */
  imputedInterestRate: 0.05,
  /** Maintenance and running costs per year, on the purchase price. */
  maintenanceRate: 0.01,
  /** The second mortgage is repaid within 15 years or by retirement. */
  maxAmortizationYears: 15,
  /** Interest + maintenance + amortization at most a third of gross income. */
  maxCostRatio: 1 / 3,
  /** Total equity: at least 20% of the purchase price. */
  minEquityShare: 0.2,
  /** Hard equity (not from the pension fund): at least 10%. */
  minHardEquityShare: 0.1,
  retirementAge: 65,
} as const;

export const roundChf = (amount: number): number => Math.round(amount);

export interface CostInput {
  /** Applicant age; shortens amortization when retirement is closer than 15 years. */
  age?: number;
  equity: number;
  price: number;
}

export interface CostBreakdown {
  amortization: number;
  amortizationYears: number;
  equity: number;
  firstMortgage: number;
  interest: number;
  maintenance: number;
  mortgage: number;
  price: number;
  requiredIncome: number;
  secondMortgage: number;
  yearlyCost: number;
}

export const amortizationYears = (age?: number): number => {
  if (age === undefined) {
    return RULES.maxAmortizationYears;
  }
  const untilRetirement = Math.max(1, RULES.retirementAge - age);
  return Math.min(RULES.maxAmortizationYears, untilRetirement);
};

export const calculateCosts = ({
  price,
  equity,
  age,
}: CostInput): CostBreakdown => {
  const mortgage = Math.max(0, price - equity);
  const firstMortgageLimit = price * RULES.firstMortgageShare;
  const firstMortgage = Math.min(mortgage, firstMortgageLimit);
  const secondMortgage = mortgage - firstMortgage;
  const years = amortizationYears(age);
  const interest = mortgage * RULES.imputedInterestRate;
  const maintenance = price * RULES.maintenanceRate;
  const amortization = secondMortgage / years;
  const yearlyCost = interest + maintenance + amortization;
  return {
    amortization,
    amortizationYears: years,
    equity,
    firstMortgage,
    interest,
    maintenance,
    mortgage,
    price,
    requiredIncome: yearlyCost / RULES.maxCostRatio,
    secondMortgage,
    yearlyCost,
  };
};

export interface EquityInput {
  hardEquity: number;
  pensionEquity: number;
  price: number;
}

export interface EquityCheck {
  equity: number;
  equityShare: number;
  hardEquity: number;
  hardEquityPassed: boolean;
  hardEquityShare: number;
  minEquity: number;
  minHardEquity: number;
  passed: boolean;
  pensionEquity: number;
  totalEquityPassed: boolean;
}

export const checkEquity = ({
  price,
  hardEquity,
  pensionEquity,
}: EquityInput): EquityCheck => {
  const equity = hardEquity + pensionEquity;
  const minEquity = price * RULES.minEquityShare;
  const minHardEquity = price * RULES.minHardEquityShare;
  const totalEquityPassed = equity >= minEquity;
  const hardEquityPassed = hardEquity >= minHardEquity;
  return {
    equity,
    equityShare: equity / price,
    hardEquity,
    hardEquityPassed,
    hardEquityShare: hardEquity / price,
    minEquity,
    minHardEquity,
    passed: totalEquityPassed && hardEquityPassed,
    pensionEquity,
    totalEquityPassed,
  };
};

export interface AffordabilityCheck {
  costRatio: number;
  grossIncome: number;
  maxYearlyCost: number;
  passed: boolean;
  yearlyCost: number;
}

export const checkAffordability = (
  costs: CostBreakdown,
  grossIncome: number
): AffordabilityCheck => {
  const costRatio = grossIncome > 0 ? costs.yearlyCost / grossIncome : 1;
  return {
    costRatio,
    grossIncome,
    maxYearlyCost: grossIncome * RULES.maxCostRatio,
    passed: costRatio <= RULES.maxCostRatio,
    yearlyCost: costs.yearlyCost,
  };
};

export interface ApplicantFigures extends EquityInput {
  age?: number;
  grossIncome: number;
}

export interface Assessment {
  affordability: AffordabilityCheck;
  costs: CostBreakdown;
  equity: EquityCheck;
  passed: boolean;
}

export const assess = (figures: ApplicantFigures): Assessment => {
  const equity = checkEquity(figures);
  const costs = calculateCosts({
    age: figures.age,
    equity: equity.equity,
    price: figures.price,
  });
  const affordability = checkAffordability(costs, figures.grossIncome);
  return {
    affordability,
    costs,
    equity,
    passed: equity.passed && affordability.passed,
  };
};

const FIX_STEP_CHF = 1000;

/** Largest whole number in [low, high] for which `ok` holds; `ok` must flip once. */
const searchMax = (
  low: number,
  high: number,
  ok: (value: number) => boolean
): number | null => {
  if (!ok(low)) {
    return null;
  }
  let lo = low;
  let hi = high;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ok(mid)) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo;
};

/** Smallest whole number in [low, high] for which `ok` holds; `ok` must flip once. */
const searchMin = (
  low: number,
  high: number,
  ok: (value: number) => boolean
): number | null => {
  if (!ok(high)) {
    return null;
  }
  let lo = low;
  let hi = high;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (ok(mid)) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }
  return lo;
};

export type FixKind = "co-borrower" | "lower-price" | "more-equity";

export interface Fix {
  /** The changed figures; running `assess` on them passes. */
  figures: ApplicantFigures;
  kind: FixKind;
  /** Lower price: the new price. More equity / co-borrower: the amount to add. */
  value: number;
}

/** Concrete changes that make a failing application pass, each verified. */
export const proposeFixes = (figures: ApplicantFigures): Fix[] => {
  const current = assess(figures);
  if (current.passed) {
    return [];
  }
  const fixes: Fix[] = [];

  // Prices fall in steps of 1,000 so the proposal reads as a real offer.
  const maxPrice = searchMax(
    0,
    Math.floor(figures.price / FIX_STEP_CHF),
    (k) => assess({ ...figures, price: k * FIX_STEP_CHF }).passed
  );
  if (maxPrice !== null && maxPrice > 0) {
    const price = maxPrice * FIX_STEP_CHF;
    fixes.push({
      figures: { ...figures, price },
      kind: "lower-price",
      value: price,
    });
  }

  // Own money counts as hard equity, so it fixes both equity rules at once.
  const extraSteps = searchMin(
    1,
    Math.ceil(figures.price / FIX_STEP_CHF),
    (k) =>
      assess({ ...figures, hardEquity: figures.hardEquity + k * FIX_STEP_CHF })
        .passed
  );
  if (extraSteps !== null) {
    const extra = extraSteps * FIX_STEP_CHF;
    fixes.push({
      figures: { ...figures, hardEquity: figures.hardEquity + extra },
      kind: "more-equity",
      value: extra,
    });
  }

  // A co-borrower's income only helps when equity already passes.
  if (current.equity.passed && !current.affordability.passed) {
    const gap = current.costs.requiredIncome - figures.grossIncome;
    const extra = Math.ceil(gap / FIX_STEP_CHF) * FIX_STEP_CHF;
    fixes.push({
      figures: { ...figures, grossIncome: figures.grossIncome + extra },
      kind: "co-borrower",
      value: extra,
    });
  }

  return fixes;
};
