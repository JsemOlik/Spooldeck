import { listSpools } from "@/db/queries/spools";
import { suggestSpools } from "@/lib/slicer/match";
import { parseSlicedFile, type SliceInfo, SlicerParseError } from "@/lib/slicer/parse";

/** Reads a sliced file and suggests an in-stock spool for each filament it uses. */
export async function previewSlicedFile(
  file: Blob,
  fileName: string,
): Promise<{ error: string } | (SliceInfo & { suggestions: (number | null)[] })> {
  let info: SliceInfo;
  try {
    info = await parseSlicedFile(file, fileName);
  } catch (e) {
    if (e instanceof SlicerParseError) return { error: e.message };
    throw e;
  }
  const spools = await listSpools({ status: "active" });
  return { ...info, suggestions: suggestSpools(info.filaments, spools) };
}
