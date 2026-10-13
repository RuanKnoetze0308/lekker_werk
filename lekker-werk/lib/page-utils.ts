export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** First value of a search param, empty strings treated as unset. */
export async function readParams(sp: SearchParams) {
  const raw = await sp;
  const get = (k: string) => {
    const v = raw[k];
    const s = Array.isArray(v) ? v[0] : v;
    return s ? s : undefined;
  };
  return { get };
}
