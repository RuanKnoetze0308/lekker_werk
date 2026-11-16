export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (v: string) => UUID.test(v);

/** A real calendar date in YYYY-MM-DD form (2026-02-30 is not one). */
export function isIsoDate(v: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/**
 * Query-string reader for pages. URLs get edited, bookmarked and shared, so every typed getter
 * returns undefined for a value that isn't valid instead of letting it reach a query and crash
 * the page: a bad filter simply behaves like no filter.
 */
export async function readParams(sp: SearchParams) {
  const raw = await sp;
  /** First value of a search param, empty strings treated as unset. */
  const get = (k: string) => {
    const v = raw[k];
    const s = Array.isArray(v) ? v[0] : v;
    return s ? s : undefined;
  };
  const when = (k: string, ok: (v: string) => boolean) => {
    const v = get(k);
    return v !== undefined && ok(v) ? v : undefined;
  };
  return {
    get,
    uuid: (k: string) => when(k, isUuid),
    date: (k: string) => when(k, isIsoDate),
    /** A page number from 1 up, as the string the list schemas coerce. */
    page: (k = "page") => when(k, (v) => /^[1-9]\d{0,5}$/.test(v)),
    oneOf: <T extends string>(k: string, allowed: readonly T[]) => when(k, (v) => (allowed as readonly string[]).includes(v)) as T | undefined,
  };
}
