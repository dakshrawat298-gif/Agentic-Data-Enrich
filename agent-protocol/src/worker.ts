import OpenAI from "openai";
import { TARGET_FIELDS } from "./schema";

/**
 * Worker agent. Uses a lightweight LLM (via the Replit OpenAI AI Integration proxy —
 * no user API key required) to convert one messy, unstructured record into clean JSON.
 * The Worker has NO chain access; it only produces structured data.
 */

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

const MODEL = process.env.WORKER_MODEL || "gpt-5-nano";

const SYSTEM_PROMPT =
  "You are a data-enrichment worker. Convert a messy, unstructured contact record " +
  `into a clean JSON object with EXACTLY these keys: ${TARGET_FIELDS.join(", ")}. ` +
  "Respond with ONLY a JSON object and no prose. If a field is not present in the " +
  'input, set it to an empty string "". Never invent or guess values that are not in the input.';

export async function enrichRow(rawText: string): Promise<Record<string, unknown>> {
  const res = await openai.chat.completions.create({
    model: MODEL,
    max_completion_tokens: 8192,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: rawText },
    ],
  });
  const content = res.choices[0]?.message?.content ?? "{}";
  return JSON.parse(content);
}
