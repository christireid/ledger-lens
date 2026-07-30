import { z } from "zod";

import { TransactionTypeSchema } from "@/lib/schemas/enums";
import {
  AccountIdSchema,
  MarketDateSchema,
  MoneySchema,
} from "@/lib/schemas/primitives";

/**
 * FilterDescriptor — §16.3; shared by URL state (06.6), API contract (17),
 * and AI tool args (08.3) so the three surfaces cannot drift.
 */
export const FilterDescriptorSchema = z.object({
  accountIds: z.array(AccountIdSchema).optional(),
  from: MarketDateSchema.optional(),
  to: MarketDateSchema.optional(),
  types: z.array(TransactionTypeSchema).optional(),
  minAmount: MoneySchema.optional(),
  maxAmount: MoneySchema.optional(),
  q: z.string().optional(),
  includeArchived: z.boolean().optional(),
  includeSuperseded: z.boolean().optional(),
});
export type FilterDescriptor = z.infer<typeof FilterDescriptorSchema>;
