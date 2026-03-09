import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { COMPARISON_SYSTEM_PROMPT } from "@/lib/prompt";
import type { ComparisonResult } from "@/lib/types";

export const maxDuration = 120;

function cleanAndParseJSON(raw: string): ComparisonResult {
  // Strip markdown fences
  let text = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

  // Extract the outermost JSON object
  const startIdx = text.indexOf("{");
  const endIdx = text.lastIndexOf("}");
  if (startIdx === -1 || endIdx === -1) {
    throw new Error("No JSON object found in response");
  }
  text = text.substring(startIdx, endIdx + 1);

  // Fix common JSON issues from LLMs:
  // 1. Trailing commas before ] or }
  text = text.replace(/,\s*([}\]])/g, "$1");
  // 2. Unescaped newlines inside string values
  text = text.replace(/\r\n/g, "\\n").replace(/\r/g, "\\n");

  try {
    return JSON.parse(text);
  } catch {
    // More aggressive: remove control characters
    text = text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
    // Fix literal newlines inside strings
    let inString = false;
    let escaped = false;
    let result = "";
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (escaped) {
        result += ch;
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        result += ch;
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        result += ch;
        continue;
      }
      if (inString && ch === "\n") {
        result += "\\n";
        continue;
      }
      if (inString && ch === "\t") {
        result += "\\t";
        continue;
      }
      result += ch;
    }

    return JSON.parse(result);
  }
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey === "your_api_key_here") {
    return NextResponse.json(
      {
        error:
          "GEMINI_API_KEY not configured. Get a free key at https://aistudio.google.com/apikey",
      },
      { status: 401 }
    );
  }

  try {
    const formData = await request.formData();
    const entries = Array.from(formData.entries());

    const parts: Array<
      { text: string } | { inlineData: { mimeType: string; data: string } }
    > = [];
    let docCount = 0;

    for (const [key, value] of entries) {
      if (!(value instanceof File) || value.size === 0) continue;

      const label = (formData.get(`${key}_label`) as string) || key;

      const buffer = Buffer.from(await value.arrayBuffer());
      const base64 = buffer.toString("base64");

      parts.push({
        inlineData: {
          mimeType: value.type,
          data: base64,
        },
      });

      parts.push({
        text: `[The above document is: "${label}" — filename: "${value.name}"]`,
      });

      docCount++;
    }

    if (docCount < 2) {
      return NextResponse.json(
        { error: "Please upload at least 2 documents to compare." },
        { status: 400 }
      );
    }

    parts.push({
      text: `Now compare ALL the uploaded documents against each other and flag every discrepancy.

  CRITICAL RULES:
- Respond with ONLY valid JSON. No markdown, no backticks, no text before or after.
- Keep ALL string values SHORT — max 1-2 sentences. Do not write long explanations.
- Keep "note" fields under 30 words.
- Keep "doc1_value" and "doc2_value" as the exact values found, not descriptions.
- Escape all special characters. No trailing commas.
- You MUST complete the entire JSON including the closing brackets.`,
    });

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash-lite",
      systemInstruction: COMPARISON_SYSTEM_PROMPT,
    });

    const result = await model.generateContent({
      contents: [{ role: "user", parts }],
      generationConfig: {
        maxOutputTokens: 8192,
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    });

    const response = result.response;
    const text = response.text();
    console.log("RAW RESPONSE:", text.substring(text.length - 500));

    const parsed = cleanAndParseJSON(text);

    // Validate and normalize the shape
    const normalized: ComparisonResult = {
      summary: parsed.summary || "Comparison completed.",
      discrepancies: Array.isArray(parsed.discrepancies) ? parsed.discrepancies : [],
      matches: Array.isArray(parsed.matches) ? parsed.matches : [],
    };

    return NextResponse.json(normalized);
  } catch (err: any) {
    console.error("Comparison API error:", err);

    if (err?.message?.includes("API_KEY_INVALID") || err?.status === 400) {
      return NextResponse.json(
        {
          error:
            "Invalid Gemini API key. Get a free one at https://aistudio.google.com/apikey",
        },
        { status: 401 }
      );
    }

    if (err?.status === 429) {
      return NextResponse.json(
        {
          error:
            "Rate limited. The free tier allows ~1000 requests/day — wait a moment and retry.",
        },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: err?.message || "Something went wrong during comparison." },
      { status: 500 }
    );
  }
}
