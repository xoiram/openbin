import { z } from "zod";

/** Zod fields for an item destination: exactly one of a bin, an area or "unassigned". */
export const targetFields = {
  target_bin_id: z.string().optional().describe("Destination bin ID (6-character short code or UUID)"),
  target_area_id: z.string().optional().describe("Destination area UUID (item becomes loose in that area)"),
  unassigned: z.boolean().optional().describe("true = leave the item loose and unassigned (no bin, no area)"),
};

export interface TargetArgs {
  target_bin_id?: string;
  target_area_id?: string;
  unassigned?: boolean;
}

/**
 * Build the REST body fields (targetBinId / targetAreaId / unassigned) from tool args.
 * Returns an error string when more than one is given, or none is given and `required` is set.
 */
export function buildTargetBody(
  args: TargetArgs,
  required: boolean,
): { body: Record<string, unknown>; label: string | null } | { error: string } {
  const given = [
    args.target_bin_id ? "target_bin_id" : null,
    args.target_area_id ? "target_area_id" : null,
    args.unassigned ? "unassigned" : null,
  ].filter((x): x is string => x !== null);

  if (given.length > 1) {
    return { error: "Provide only one of 'target_bin_id', 'target_area_id' or 'unassigned'." };
  }
  if (given.length === 0) {
    if (required) {
      return { error: "Provide exactly one of 'target_bin_id', 'target_area_id' or 'unassigned: true'." };
    }
    return { body: {}, label: null };
  }
  if (args.target_bin_id) return { body: { targetBinId: args.target_bin_id }, label: `bin ${args.target_bin_id}` };
  if (args.target_area_id) return { body: { targetAreaId: args.target_area_id }, label: `area ${args.target_area_id}` };
  return { body: { unassigned: true }, label: "unassigned (no bin, no area)" };
}
