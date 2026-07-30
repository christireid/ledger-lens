/**
 * Public ID mapping — §16.2/§09.2: DB stores bare UUIDs; prefixed public IDs
 * exist exclusively at the §17 serialization layer.
 */
export const PUBLIC_ID_PREFIX = {
  workspace: "wsp",
  account: "acc",
  transaction: "txn",
  instrument: "ins",
  batch: "batch",
  anomaly: "anm",
  alertRule: "alr",
  notification: "ntf",
  investigation: "inv",
  message: "msg",
} as const;

export type PublicIdKind = keyof typeof PUBLIC_ID_PREFIX;

export function toPublicId(kind: PublicIdKind, uuid: string): string {
  return `${PUBLIC_ID_PREFIX[kind]}_${uuid}`;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Returns the bare UUID, or null when the prefix/kind/uuid shape is wrong. */
export function fromPublicId(kind: PublicIdKind, publicId: string): string | null {
  const prefix = `${PUBLIC_ID_PREFIX[kind]}_`;
  if (!publicId.startsWith(prefix)) return null;
  const uuid = publicId.slice(prefix.length);
  return UUID_RE.test(uuid) ? uuid.toLowerCase() : null;
}
