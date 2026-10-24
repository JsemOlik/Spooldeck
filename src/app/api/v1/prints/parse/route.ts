import { ApiError, withApi } from "@/lib/auth/api";
import { previewSlicedFile } from "@/server/services/prints";

/**
 * Body: the .gcode / .bgcode file, either raw (name it with ?name=) or as the "file" field of a
 * multipart form. Returns the filament usage and a suggested spool for each filament.
 */
export const POST = withApi(async ({ req }) => {
  let file: Blob;
  let name = new URL(req.url).searchParams.get("name") ?? "";
  if (req.headers.get("content-type")?.startsWith("multipart/form-data")) {
    const upload = (await req.formData()).get("file");
    if (!(upload instanceof File)) throw new ApiError(400, 'Send the file in a "file" field');
    file = upload;
    name ||= upload.name;
  } else {
    file = await req.blob();
  }
  if (!file.size) throw new ApiError(400, "Send a .gcode or .bgcode file");

  const preview = await previewSlicedFile(file, name || "Print");
  if ("error" in preview) throw new ApiError(422, preview.error);
  return Response.json(preview);
});
