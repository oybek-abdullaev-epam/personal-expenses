import he from "he";
import { localDateTime, money } from "./domain";
export interface Part {
  mimeType?: string;
  filename?: string;
  body?: { data?: string };
  parts?: Part[];
  headers?: { name: string; value: string }[];
}
export interface GmailMessage {
  id: string;
  internalDate: string;
  payload: Part;
}
export type Parsed =
  | {
      direction: "expense" | "income";
      merchant: string;
      occurred_at: string;
      card_suffix: string;
      amount_minor: number;
      currency: string;
    }
  | { review_reason: string };
function decode(data: string): string {
  return new TextDecoder().decode(
    Uint8Array.from(atob(data.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
      c.charCodeAt(0),
    ),
  );
}
export function bodyText(part: Part): string {
  if (part.filename) return "";
  if (part.parts?.length) {
    const plain = part.parts.filter(
      (p) => p.mimeType === "text/plain" && !p.filename,
    );
    return (plain.length ? plain : part.parts).map(bodyText).join("\n");
  }
  if (
    !part.body?.data ||
    !["text/plain", "text/html"].includes(part.mimeType ?? "")
  )
    return "";
  const text = decode(part.body.data);
  if (text.length > 200000) throw new Error("message_too_large");
  return part.mimeType === "text/html"
    ? he.decode(
        text
          .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
          .replace(/<(?:br|\/p|\/div|\/tr)\b[^>]*>/gi, "\n")
          .replace(/<[^>]+>/g, " "),
      )
    : text;
}
export function matches(message: GmailMessage): boolean {
  const header = (name: string) =>
    message.payload.headers
      ?.find((h) => h.name.toLowerCase() === name)
      ?.value.trim();
  const from = header("from") ?? "";
  return (
    /^(?:[^<>]*<)?noreply@info\.uzcard\.uz>?$/i.test(from) &&
    header("subject") === "UZCARD INFO"
  );
}
export function parseEmail(message: GmailMessage): Parsed {
  try {
    const text = bodyText(message.payload)
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ");
    // Parse every transaction-shaped line; both language copies must agree exactly.
    const lines = text
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter((x) => /karta\s*\*|summa\s*:/i.test(x));
    if (!lines.length) return { review_reason: "unrecognized_format" };
    const parsed = lines.map((line) => {
      const m =
        /^([^:]+):\s*(.+?)(?:,\s*|\s+)(\d{2}\.\d{2}\.\d{2} \d{2}:\d{2}(?::\d{2})?)(?:,\s*|\s+)karta\s*\*{3,}(\d{4})\.\s*summa:\s*(\d+\.\d{2})\s+([A-Z]{3})(?:,?\s+balans:\s*-?\d+\.\d{2}\s+[A-Z]{3})?$/i.exec(
          line,
        );
      if (!m) throw new Error("unrecognized_format");
      if (
        ![
          "e-com oplata",
          "oplata",
          "pokupka",
          "platezh",
          "perevod na kartu",
        ].includes(m[1].trim().toLowerCase())
      )
        throw new Error("unsupported_operation");
      if (!["UZS", "USD", "EUR", "RUB"].includes(m[6]))
        throw new Error("unsupported_currency");
      if (m[2].length > 250) throw new Error("unrecognized_format");
      return {
        direction:
          m[1].trim().toLowerCase() === "perevod na kartu"
            ? ("income" as const)
            : ("expense" as const),
        merchant: m[2].trim(),
        occurred_at: localDateTime(m[3]),
        card_suffix: m[4],
        amount_minor: money(m[5]),
        currency: m[6],
      };
    });
    if (new Set(parsed.map((p) => JSON.stringify(p))).size !== 1)
      return { review_reason: "conflicting_transactions" };
    return parsed[0];
  } catch (e) {
    const safe = [
      "unsupported_operation",
      "unsupported_currency",
      "invalid_amount",
      "invalid_time",
      "message_too_large",
    ];
    return {
      review_reason:
        e instanceof Error && safe.includes(e.message)
          ? e.message
          : "unrecognized_format",
    };
  }
}
