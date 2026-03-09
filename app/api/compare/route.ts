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

// Extract with text-based prompt
async function extractFromText(
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
      maxOutputTokens: 8192,
      temperature: 0,
      responseMimeType: "application/json",
    },
  });

  return cleanAndParseJSON(result.response.text());
}

// Extract with vision (for scanned/image PDFs)
async function extractFromImage(
  apiKey: string,
  label: string,
  fileBuffer: Buffer,
  mimeType: string,
  model: string
): Promise<any> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const gemini = genAI.getGenerativeModel({
    model,
    systemInstruction: EXTRACTION_SYSTEM_PROMPT,
  });

  const result = await gemini.generateContent({
    contents: [{
      role: "user",
      parts: [
        { inlineData: { mimeType, data: fileBuffer.toString("base64") } },
        { text: buildExtractionPrompt(label, "[See the attached document image above]") },
      ],
    }],
    generationConfig: {
      maxOutputTokens: 8192,
      temperature: 0,
      responseMimeType: "application/json",
    },
  });

  return cleanAndParseJSON(result.response.text());
}

async function extractWithFallback(
  apiKey: string,
  label: string,
  text: string | null,
  fileBuffer: Buffer,
  mimeType: string
): Promise<any> {
  const useVision = !text || text.length < 50; // Too little text = probably scanned

  const extract = async (model: string) => {
    if (useVision) {
      console.log(`  Using vision for: ${label}`);
      return await extractFromImage(apiKey, label, fileBuffer, mimeType, model);
    } else {
      console.log(`  Using text for: ${label} (${text!.length} chars)`);
      console.log(`  TEXT CONTENT:\n${text}`);
      return await extractFromText(apiKey, label, text!, model);
    }
  };

  try {
    return await extract("gemini-2.5-flash");
  } catch (err: any) {
    if (err?.status === 429 || err?.message?.includes("429")) {
      console.log(`  Flash rate limited for ${label}, using flash-lite`);
      return await extract("gemini-2.5-flash-lite");
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
          // If very little text extracted, treat as scanned
          if (!text || text.length < 1000) text = null;
        } catch {
          text = null; // pdf-parse failed, will use vision
        }
      }

      docs.push({
        label,
        filename: value.name,
        text,
        buffer,
        mimeType: value.type,
      });
    }

    if (docs.length < 2) {
      return NextResponse.json(
        { error: "Please upload at least 2 documents to compare." },
        { status: 400 }
      );
    }

    // STAGE 1: Extract structured data from each document
    console.log("Stage 1: Extracting structured data...");
    const extractedDocs = await Promise.all(
      docs.map(async (doc) => {
        console.log(`  Extracting: ${doc.label} (${doc.filename})`);
        const data = await extractWithFallback(
          apiKey,
          doc.label,
          doc.text,
          doc.buffer,
          doc.mimeType
        );
        console.log(`  → ${doc.label}: ${(data.items || []).length} items, shipper: ${data.shipper || "?"}`);
        return data;
      })
    );

    // Post-extraction fix: detect shipper/consignee swaps between documents
    // If doc A's shipper matches doc B's consignee AND vice versa, one is swapped
    if (extractedDocs.length >= 2) {
      const a = extractedDocs[0];
      const b = extractedDocs[1];

      const aShipper = (a.shipper || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const aConsignee = (a.consignee || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const bShipper = (b.shipper || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const bConsignee = (b.consignee || "").toLowerCase().replace(/[^a-z0-9]/g, "");

      if (
        aShipper && aConsignee && bShipper && bConsignee &&
        aShipper === bConsignee && aConsignee === bShipper
      ) {
        // One document has them swapped — trust the one that's a B/L, or the second doc
        const blIndex = extractedDocs.findIndex(
          (d) => (d.document_type || "").toLowerCase().includes("lading") ||
                 (d.document_type || "").toLowerCase().includes("b/l") ||
                 (d.document_type || "").toLowerCase().includes("bl")
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