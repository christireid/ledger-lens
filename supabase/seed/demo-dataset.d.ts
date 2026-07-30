export declare const DEMO_DATASET_VERSION: string;
export declare const DEMO_SEED_DATE: string;

export type DemoAccount = {
  key: "brokerage" | "checking" | "card";
  name: string;
  type: "brokerage" | "bank" | "card";
  institution: string;
  currency: string;
};

export type DemoInstrument = {
  symbol: string;
  kind: "equity" | "etf";
  name: string;
  currency: string;
};

export type DemoTransaction = {
  accountKey: "brokerage" | "checking" | "card";
  date: string;
  type: string;
  amount: string;
  currency: string;
  description: string;
  symbol?: string;
  quantity?: string;
  price?: string;
};

export type DemoDataset = {
  version: string;
  seedDate: string;
  accounts: DemoAccount[];
  instruments: DemoInstrument[];
  transactions: DemoTransaction[];
};

export declare function generateDemoDataset(): DemoDataset;
export declare function generateDemoImportCsv(): string;
