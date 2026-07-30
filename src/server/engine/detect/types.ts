import type { z } from "zod";

import type { AnomalySeverity } from "@/lib/schemas/enums";
import type { EngineTx } from "@/server/engine/portfolio/types";
import type { ComputedSnapshot } from "@/server/engine/portfolio/types";

/**
 * Shared detection engine — §14.2. Pure functions: (DetectorInput) → Finding[].
 * One engine for anomaly detectors (default params) and alert rules (user
 * params); the S-08 preview runs the identical code path.
 */

export type DetectorKey =
  | "duplicate_charge"
  | "fee_spike"
  | "large_transaction"
  | "allocation_drift"
  | "data_integrity"
  | "account_inactivity";

export type DetectorTx = EngineTx & { description: string };

export type DetectorInput = {
  /** head-row transactions (non-superseded) */
  transactions: readonly DetectorTx[];
  /** latest snapshot (null for empty workspaces) */
  snapshot: ComputedSnapshot | null;
  /** trailing snapshots for baseline detectors (D4), ascending by asOf */
  snapshotSeries?: ReadonlyArray<{ asOf: string; equityPct: number | null }>;
  /** evaluation date (injected — engine stays clock-free) */
  asOf: string;
};

export type Finding = {
  detectorKey: DetectorKey;
  severity: AnomalySeverity;
  title: string;
  evidenceTxIds: string[]; // ≤100, overflow truncated with count note
  evidenceHash: string;
  explainInput: Record<string, unknown>;
};

export type DetectorDef<P = unknown> = {
  key: DetectorKey;
  paramsSchema: z.ZodType<P>;
  defaultParams: P;
  /** false → system-only, absent from the S-08 rule-type list (§14.3 D5) */
  userConfigurable: boolean;
  run: (input: DetectorInput, params: P) => Finding[];
  explainTemplate: (finding: Finding) => string;
};
