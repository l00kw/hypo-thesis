// The three applicant dossiers of Exercise 4, one object per document,
// extracted by hand from Exercise_4_Mortgage_Data/A{1,2,3}_*/0{1..7}_*.pdf.
// Values are copied as printed, including where the documents disagree:
// finding those disagreements is the consistency check's job.

/** The register extracts are dated 15.09.2026; ages are taken on that day. */
export const REFERENCE_DATE = "2026-09-15";

export const DOCUMENTS = {
  application: "01 Hypothekarantrag",
  bankStatement: "06 Vermögensausweis Bank",
  debtRegister: "04 Betreibungsregisterauszug",
  pension: "05 Vorsorgeausweis",
  salaryCertificate: "02 Lohnausweis 2025",
  salesDocumentation: "07 Verkaufsdokumentation",
  taxReturn: "03 Steuererklärung 2025",
} as const;

export type DocumentKey = keyof typeof DOCUMENTS;

export interface DebtEntry {
  amount: number;
  creditor: string;
  date: string;
  status: string;
}

export interface Dossier {
  application: {
    address: string;
    bankAndSavings: number;
    birthDate: string;
    employer: string;
    name: string;
    occupation: string;
    pensionWithdrawal: number;
    price: number;
    requestedMortgage: number;
    securities: number;
    statedGrossIncome: number;
    statedIncomeNote?: string;
    totalEquity: number;
  };
  bankStatement: {
    asOf: string;
    privateAccount: number;
    savingsAccount: number;
    securities: number;
    total: number;
  };
  debtRegister: { asOf: string; entries: DebtEntry[]; office: string };
  id: string;
  pension: {
    fund: string;
    insuredSalary: number;
    maxWithdrawal: number;
    requestedWithdrawal: number;
    retirementAssets: number;
  };
  property: { address: string; description: string };
  salaryCertificate: {
    bonus: number;
    employer: string;
    grossSalary: number;
    netSalary: number;
    year: number;
  };
  salesDocumentation: {
    area: string;
    builtYear: number;
    price: number;
    rooms: number;
  };
  taxReturn: {
    bankAssets: number;
    debts: number;
    netSalary: number;
    securities: number;
    taxableAssets: number;
  };
}

export const DOSSIERS: readonly Dossier[] = [
  {
    application: {
      address: "Seestrasse 14, 8610 Uster",
      bankAndSavings: 140_000,
      birthDate: "1988-05-11",
      employer: "Helvetic Data AG, Zürich",
      name: "Thomas Meier",
      occupation: "Projektleiter IT",
      pensionWithdrawal: 0,
      price: 900_000,
      requestedMortgage: 700_000,
      securities: 60_000,
      statedGrossIncome: 165_000,
      totalEquity: 200_000,
    },
    bankStatement: {
      asOf: "2026-08-31",
      privateAccount: 21_000,
      savingsAccount: 119_000,
      securities: 60_000,
      total: 200_000,
    },
    debtRegister: {
      asOf: "2026-09-15",
      entries: [],
      office: "Betreibungsamt Uster",
    },
    id: "A1",
    pension: {
      fund: "Pensionskasse Limmat-Reuss",
      insuredSalary: 138_540,
      maxWithdrawal: 121_400,
      requestedWithdrawal: 0,
      retirementAssets: 121_400,
    },
    property: {
      address: "Brunnenweg 3, 8610 Uster",
      description: "4.5-Zimmer-Eigentumswohnung",
    },
    salaryCertificate: {
      bonus: 0,
      employer: "Helvetic Data AG, Zürich",
      grossSalary: 165_000,
      netSalary: 144_780.45,
      year: 2025,
    },
    salesDocumentation: {
      area: "118 m²",
      builtYear: 2019,
      price: 900_000,
      rooms: 4.5,
    },
    taxReturn: {
      bankAssets: 140_000,
      debts: 0,
      netSalary: 144_780.45,
      securities: 60_000,
      taxableAssets: 200_000,
    },
  },
  {
    application: {
      address: "Bahnhofstrasse 41, 8620 Wetzikon",
      bankAndSavings: 70_000,
      birthDate: "1982-01-27",
      employer: "Spital Zürcher Oberland AG",
      name: "Nicole Baumgartner",
      occupation: "Oberärztin Innere Medizin",
      pensionWithdrawal: 160_000,
      price: 1_100_000,
      requestedMortgage: 870_000,
      securities: 0,
      statedGrossIncome: 260_000,
      totalEquity: 230_000,
    },
    bankStatement: {
      asOf: "2026-08-31",
      privateAccount: 10_500,
      savingsAccount: 59_500,
      securities: 0,
      total: 70_000,
    },
    debtRegister: {
      asOf: "2026-09-15",
      entries: [],
      office: "Betreibungsamt Wetzikon",
    },
    id: "A2",
    pension: {
      fund: "Pensionskasse Limmat-Reuss",
      insuredSalary: 233_540,
      maxWithdrawal: 310_500,
      requestedWithdrawal: 160_000,
      retirementAssets: 310_500,
    },
    property: {
      address: "Lindenhof 9, 8623 Wetzikon",
      description: "5.5-Zimmer-Einfamilienhaus",
    },
    salaryCertificate: {
      bonus: 0,
      employer: "Spital Zürcher Oberland AG",
      grossSalary: 260_000,
      netSalary: 228_807.95,
      year: 2025,
    },
    salesDocumentation: {
      area: "165 m² Wohnfläche, 480 m² Grundstück",
      builtYear: 2004,
      price: 1_100_000,
      rooms: 5.5,
    },
    taxReturn: {
      bankAssets: 70_000,
      debts: 0,
      netSalary: 228_807.95,
      securities: 0,
      taxableAssets: 70_000,
    },
  },
  {
    application: {
      address: "Dorfstrasse 77, 8810 Horgen",
      bankAndSavings: 180_000,
      birthDate: "1984-12-03",
      employer: "Medilab Diagnostics AG, Baar",
      name: "Daniel Schmid",
      occupation: "Verkaufsleiter Schweiz",
      pensionWithdrawal: 0,
      price: 1_250_000,
      requestedMortgage: 970_000,
      securities: 100_000,
      statedGrossIncome: 190_000,
      statedIncomeNote: "inkl. erwarteter Bonus",
      totalEquity: 280_000,
    },
    bankStatement: {
      asOf: "2026-08-31",
      privateAccount: 27_000,
      savingsAccount: 153_000,
      securities: 100_000,
      total: 280_000,
    },
    debtRegister: {
      asOf: "2026-09-15",
      entries: [
        {
          amount: 2340,
          creditor: "Steueramt des Kantons Zürich",
          date: "2024-03-12",
          status: "Zahlungsbefehl zugestellt, Forderung am 02.05.2024 bezahlt",
        },
      ],
      office: "Betreibungsamt Horgen",
    },
    id: "A3",
    pension: {
      fund: "Pensionskasse Limmat-Reuss",
      insuredSalary: 148_540,
      maxWithdrawal: 205_800,
      requestedWithdrawal: 0,
      retirementAssets: 205_800,
    },
    property: {
      address: "Rebbergstrasse 22, 8810 Horgen",
      description: "5.5-Zimmer-Einfamilienhaus",
    },
    salaryCertificate: {
      bonus: 0,
      employer: "Medilab Diagnostics AG, Baar",
      grossSalary: 175_000,
      netSalary: 153_625.45,
      year: 2025,
    },
    salesDocumentation: {
      area: "172 m² Wohnfläche, 520 m² Grundstück",
      builtYear: 2011,
      price: 1_250_000,
      rooms: 5.5,
    },
    taxReturn: {
      bankAssets: 180_000,
      debts: 0,
      netSalary: 153_625.45,
      securities: 100_000,
      taxableAssets: 280_000,
    },
  },
];
