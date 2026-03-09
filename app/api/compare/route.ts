import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import pdfParse from "pdf-parse";
import { EXTRACTION_SYSTEM_PROMPT, buildExtractionPrompt } from "@/lib/prompt";
import { compareDocuments } from "@/lib/compare";

export const maxDuration = 120;

function cleanAndParseJSON(raw: string): any {
  let text = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

  const startIdx = text.indexOf("{");
  const endIdx = text.lastIndexOf("}");
  if (startIdx === -1 || endIdx === -1) throw new Error("No JSON found");
  text = text.substring(startIdx, endIdx + 1);
  text = text.replace(/,\s*([}\]])/g, "$1");

  try {
    return JSON.parse(text);
  } catch {
    text = text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
    let inString = false;
    let escaped = false;
    let result = "";
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (escaped) { result += ch; escaped = false; continue; }
      if (ch === "\\") { result += ch; escaped = true; continue; }
      if (ch === '"') { inString = !inString; result += ch; continue; }
      if (inString && ch === "\n") { result += "\\n"; continue; }
      if (inString && ch === "\t") { result += "\\t"; continue; }
      result += ch;
    }
    return JSON.parse(result);
  }
}

async function extractTextFromPDF(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const data = await pdfParse(buffer);
  return data.text.trim();
}

async function extractDocumentData(
  apiKey: string,
  label: string,
  text: string,
  model: string
): Promise<any> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const gemini = genAI.getGenerativeModel({
    model,
    systemInstruction: EXTRACTION_SYSTEM_PROMPT,
  });

  const result = await gemini.generateContent({
    contents: [{ role: "user", parts: [{ text: buildExtractionPrompt(label, text) }] }],
    generationConfig: {
      maxOutputTokens: 4096,
      temperature: 0,
      responseMimeType: "application/json",
    },
  });

  return cleanAndParseJSON(result.response.text());
}

async function callWithFallback(
  apiKey: string,
  label: string,
  text: string
): Promise<any> {
  try {
    return await extractDocumentData(apiKey, label, text, "gemini-2.5-flash");
  } catch (err: any) {
    if (err?.status === 429 || err?.message?.includes("429")) {
      console.log(`gemini-2.5-flash rate limited for ${label}, falling back`);
      return await extractDocumentData(apiKey, label, text, "gemini-2.5-flash-lite");
    }
    throw err;
  }
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey === "your_api_key_here") {
    return NextResponse.json(
      { error: "GEMINI_API_KEY not configured. Get a free key at https://aistudio.google.com/apikey" },
      { status: 401 }
    );
  }

  try {
    const formData = await request.formData();
    const entries = Array.from(formData.entries());

    const docs: { label: string; filename: string; text: string }[] = [];

    for (const [key, value] of entries) {
      if (!(value instanceof File) || value.size === 0) continue;

      const label = (formData.get(`${key}_label`) as string) || key;

      if (value.type === "application/pdf") {
        const text = await extractTextFromPDF(value);
        docs.push({ label, filename: value.name, text });
      } else {
        return NextResponse.json(
          { error: `"${value.name}" is an image. Please upload PDF documents for best results.` },
          { status: 400 }
        );
      }
    }

    if (docs.length < 2) {
      return NextResponse.json(
        { error: "Please upload at least 2 PDF documents to compare." },
        { status: 400 }
      );
    }

    // STAGE 1: Extract structured data from each document (parallel)
    console.log("Stage 1: Extracting data from documents...");
    const extractedDocs = await Promise.all(
      docs.map(async (doc) => {
        console.log(`  Extracting: ${doc.label} (${doc.filename})`);
        const data = await callWithFallback(apiKey, doc.label, doc.text);
        console.log(`  Extracted ${doc.label}:`, JSON.stringify(data).substring(0, 300));
        return data;
      })
    );

    // STAGE 2: Compare documents in code (no AI needed)
    console.log("Stage 2: Comparing extracted data...");
    const result = compareDocuments(extractedDocs[0], extractedDocs[1]);

    if (extractedDocs.length > 2) {
      for (let i = 2; i < extractedDocs.length; i++) {
        const additional = compareDocuments(extractedDocs[0], extractedDocs[i]);
        result.discrepancies.push(...additional.discrepancies);
        for (const m of additional.matches) {
          if (!result.matches.includes(m)) result.matches.push(m);
        }
      }
    }

    console.log(`Result: ${result.discrepancies.length} discrepancies, ${result.matches.length} matches`);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Comparison API error:", err);

    if (err?.status === 429 || err?.message?.includes("429")) {
      return NextResponse.json(
        { error: "Rate limited. Wait a minute and try again." },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: err?.message || "Something went wrong during comparison." },
      { status: 500 }
    );
  }
}