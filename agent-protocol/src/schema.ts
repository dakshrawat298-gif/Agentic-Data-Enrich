/**
 * Target JSON shape for an enriched record, plus a purely deterministic validator.
 * The Master uses ONLY these rule-based checks to verify Worker output — no LLM.
 */

export interface EnrichedRecord {
  name: string;
  email: string;
  company: string;
  role: string;
  location: string;
}

export const TARGET_FIELDS = ["name", "email", "company", "role", "location"] as const;

/** Fields that must be present AND non-empty for a record to be accepted. */
const REQUIRED_NONEMPTY = ["name", "email", "company"] as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateRecord(obj: unknown): ValidationResult {
  const errors: string[] = [];

  if (typeof obj !== "object" || obj === null) {
    return { valid: false, errors: ["output is not a JSON object"] };
  }
  const rec = obj as Record<string, unknown>;

  for (const field of TARGET_FIELDS) {
    if (typeof rec[field] !== "string") {
      errors.push(`${field}: missing or not a string`);
    }
  }

  for (const field of REQUIRED_NONEMPTY) {
    if (typeof rec[field] === "string" && (rec[field] as string).trim() === "") {
      errors.push(`${field}: required but empty`);
    }
  }

  if (typeof rec.email === "string" && rec.email.trim() !== "" && !EMAIL_RE.test(rec.email.trim())) {
    errors.push("email: invalid format");
  }

  return { valid: errors.length === 0, errors };
}
