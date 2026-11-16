import "server-only";
import { notFound } from "next/navigation";
import { ZodError } from "zod";
import { isUuid } from "@/lib/page-utils";
import { AppError } from "../errors";

/** A route id that isn't a uuid can't match anything: show the 404 page instead of querying. */
export function pageId(id: string): string {
  if (!isUuid(id)) notFound();
  return id;
}

/**
 * For the main record of a detail page. "Doesn't exist", "belongs to another company" and "not
 * one of your locations" all become the same 404 page, so a page never crashes on a stale link
 * and never confirms that a record exists to someone who may not see it.
 */
export async function orNotFound<T>(load: Promise<T>): Promise<T> {
  try {
    return await load;
  } catch (err) {
    if (err instanceof ZodError) notFound();
    if (err instanceof AppError && (err.status === 403 || err.status === 404 || err.status === 422)) notFound();
    throw err;
  }
}
