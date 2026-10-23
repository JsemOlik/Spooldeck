import QRCode from "qrcode";

export async function qrSvg(text: string, opts: { margin?: number; ecl?: "L" | "M" | "Q" | "H" } = {}) {
  return QRCode.toString(text, {
    type: "svg",
    margin: opts.margin ?? 0,
    errorCorrectionLevel: opts.ecl ?? "M",
    color: { dark: "#000000", light: "#ffffff" },
  });
}

export function spoolUrl(baseUrl: string, code: string) {
  return `${baseUrl.replace(/\/+$/, "")}/s/${code}`;
}
