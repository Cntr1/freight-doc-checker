import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
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
    let inStr = false, esc = false, out = "";
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (esc) { out += c; esc = false; continue; }
      if (c === "\\") { out += c; esc = true; continue; }
      if (c === '"') { inStr = !inStr; out += c; continue; }
      if (inStr && c === "\n") { out += "\\n"; continue; }
      if (inStr && c === "\t") { out += "\\t"; continue; }
      out += c;
    }
    return JSON.parse(out);
  }
}

// ============ GROQ (primary) ============

async function extractWithGroq(
  apiKey: string,
  label: string,
  text: string | null,
  fileBuffer: Buffer,
  mimeType: string
): Promise<any> {
  const groq = new OpenAI({
    apiKey,
    baseURL: "https://api.groq.com/openai/v1",
  });

  const useVision = !text || text.length < 1000;

  let messages: any[];

  if (useVision) {
    console.log(`  [Groq] Using vision for: ${label}`);
    const base64 = fileBuffer.toString("base64");
    const dataUrl = `data:${mimeType};base64,${base64}`;

    messages = [{
      role: "user",
      content: [
        {
          type: "image_url",
          image_url: { url: dataUrl },
        },
        {
          type: "text",
          text: buildExtractionPrompt(label, "[See the attached document image above]"),
        },
      ],
    }];
  } else {
    console.log(`  [Groq] Using text for: ${label} (${text!.length} chars)`);
    messages = [{
      role: "user",
      content: buildExtractionPrompt(label, text!),
    }];
  }

  const response = await groq.chat.completions.create({
    model: useVision ? "meta-llama/llama-4-scout-17b-16e-instruct" : "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
      ...messages,
    ],
    temperature: 0,
    max_tokens: 8192,
    response_format: { type: "json_object" },
  });

  const raw = response.choices[0]?.message?.content || "";
  return cleanAndParseJSON(raw);
}

// ============ GEMINI (fallback) ============

async function extractWithGemini(
  apiKey: string,
  label: string,
  text: string | null,
  fileBuffer: Buffer,
  mimeType: string
): Promise<any> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const useVision = !text || text.length < 1000;
  const model = "gemini-2.5-flash-lite";

  const gemini = genAI.getGenerativeModel({
    model,
    systemInstruction: EXTRACTION_SYSTEM_PROMPT,
  });

  let parts: any[];
  if (useVision) {
    console.log(`  [Gemini] Using vision for: ${label}`);
    parts = [
      { inlineData: { mimeType, data: fileBuffer.toString("base64") } },
      { text: buildExtractionPrompt(label, "[See the attached document image above]") },
    ];
  } else {
    console.log(`  [Gemini] Using text for: ${label} (${text!.length} chars)`);
    parts = [{ text: buildExtractionPrompt(label, text!) }];
  }

  const result = await gemini.generateContent({
    contents: [{ role: "user", parts }],
    generationConfig: {
      maxOutputTokens: 8192,
      temperature: 0,
      responseMimeType: "application/json",
    },
  });

  return cleanAndParseJSON(result.response.text());
}

// ============ EXTRACT WITH FALLBACK ============

async function extractWithFallback(
  groqKey: string | undefined,
  geminiKey: string | undefined,
  label: string,
  text: string | null,
  fileBuffer: Buffer,
  mimeType: string
): Promise<any> {
  // Try Groq first (much higher free tier)
  if (groqKey) {
    try {
      return await extractWithGroq(groqKey, label, text, fileBuffer, mimeType);
    } catch (err: any) {
      console.log(`  Groq failed for ${label}: ${err.message?.substring(0, 100)}`);
      if (geminiKey) {
        console.log(`  Falling back to Gemini for ${label}`);
      } else {
        throw err;
      }
    }
  }

  // Fallback to Gemini
  if (geminiKey) {
    return await extractWithGemini(geminiKey, label, text, fileBuffer, mimeType);
  }

  throw new Error("No API keys configured. Set GROQ_API_KEY or GEMINI_API_KEY in .env.local");
}

// ============ MAIN HANDLER ============

export async function POST(request: NextRequest) {
  const groqKey = process.env.GROQ_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if ((!groqKey || groqKey === "your_groq_key_here") && (!geminiKey || geminiKey === "your_gemini_key_here")) {
    return NextResponse.json(
      { error: "No API keys configured. Set GROQ_API_KEY (free at console.groq.com) or GEMINI_API_KEY in .env.local" },
      { status: 401 }
    );
  }

  const activeGroqKey = groqKey && groqKey !== "your_groq_key_here" ? groqKey : undefined;
  const activeGeminiKey = geminiKey && geminiKey !== "your_gemini_key_here" ? geminiKey : undefined;

  try {
    const formData = await request.formData();
    const entries = Array.from(formData.entries());

    const docs: {
      label: string;
      filename: string;
      text: string | null;
      buffer: Buffer;
      mimeType: string;
    }[] = [];

    for (const [key, value] of entries) {
      if (!(value instanceof File) || value.size === 0) continue;
      const label = (formData.get(`${key}_label`) as string) || key;
      const buffer = Buffer.from(await value.arrayBuffer());

      let text: string | null = null;
      if (value.type === "application/pdf") {
        try {
          const data = await pdfParse(buffer);
          text = data.text.trim();
          if (!text || text.length < 1000) text = null;
        } catch {
          text = null;
        }
      }

      docs.push({ label, filename: value.name, text, buffer, mimeType: value.type });
    }

    if (docs.length < 2) {
      return NextResponse.json(
        { error: "Please upload at least 2 documents to compare." },
        { status: 400 }
      );
    }

    // STAGE 1: Extract structured data
    console.log("Stage 1: Extracting structured data...");
    const extractedDocs = await Promise.all(
      docs.map(async (doc) => {
        console.log(`  Extracting: ${doc.label} (${doc.filename})`);
        const data = await extractWithFallback(
          activeGroqKey, activeGeminiKey,
          doc.label, doc.text, doc.buffer, doc.mimeType
        );
        console.log(`  → ${doc.label}: ${(data.items || []).length} items, shipper: ${data.shipper || "?"}`);
        return data;
      })
    );

    // Post-extraction: detect shipper/consignee swaps
    if (extractedDocs.length >= 2) {
      const a = extractedDocs[0];
      const b = extractedDocs[1];

      const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const aShipper = norm(a.shipper);
      const aConsignee = norm(a.consignee);
      const bShipper = norm(b.shipper);
      const bConsignee = norm(b.consignee);

      if (
        aShipper && aConsignee && bShipper && bConsignee &&
        aShipper === bConsignee && aConsignee === bShipper
      ) {
        const blIndex = extractedDocs.findIndex(
          (d) => (d.document_type || "").toLowerCase().match(/lading|b\/l|bl/)
        );
        const trustIndex = blIndex >= 0 ? blIndex : 1;
        const fixIndex = trustIndex === 0 ? 1 : 0;

        console.log(`  Detected shipper/consignee swap in "${extractedDocs[fixIndex].document_type}" — correcting`);
        const temp = extractedDocs[fixIndex].shipper;
        const tempAddr = extractedDocs[fixIndex].shipper_address;
        extractedDocs[fixIndex].shipper = extractedDocs[fixIndex].consignee;
        extractedDocs[fixIndex].shipper_address = extractedDocs[fixIndex].consignee_address;
        extractedDocs[fixIndex].consignee = temp;
        extractedDocs[fixIndex].consignee_address = tempAddr;
      }
    }

    // STAGE 2: Compare in code
    console.log("Stage 2: Comparing...");
    const result = compareDocuments(extractedDocs[0], extractedDocs[1]);

    if (extractedDocs.length > 2) {
      for (let i = 2; i < extractedDocs.length; i++) {
        const extra = compareDocuments(extractedDocs[0], extractedDocs[i]);
        result.discrepancies.push(...extra.discrepancies);
        for (const m of extra.matches) {
          if (!result.matches.includes(m)) result.matches.push(m);
        }
      }
    }

    console.log(`Done: ${result.discrepancies.length} discrepancies, ${result.matches.length} matches`);
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
