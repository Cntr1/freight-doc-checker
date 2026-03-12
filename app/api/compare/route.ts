import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import pdfParse from "pdf-parse";
import { EXTRACTION_SYSTEM_PROMPT, buildExtractionPrompt } from "@/lib/prompt";
import { compareDocuments, comparePreShipment } from "@/lib/compare";
import { parseGensoftXml } from "@/lib/xml-parser";
import { generateGensoftXml } from "@/lib/xml-generator";
import type { ExtractedDoc, MasterBolData } from "@/lib/types";

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

// ── Groq (primary) ────────────────────────────────────────────────────────

async function extractWithGroq(
  apiKey: string, label: string, text: string | null, fileBuffer: Buffer, mimeType: string
): Promise<any> {
  const groq = new OpenAI({ apiKey, baseURL: "https://api.groq.com/openai/v1" });
  const useVision = !text || text.length < 1000;
  let messages: any[];

  if (useVision) {
    console.log(`  [Groq] vision: ${label}`);
    const dataUrl = `data:${mimeType};base64,${fileBuffer.toString("base64")}`;
    messages = [{ role: "user", content: [
      { type: "image_url", image_url: { url: dataUrl } },
      { type: "text", text: buildExtractionPrompt(label, "[See the attached document image above]") },
    ]}];
  } else {
    console.log(`  [Groq] text: ${label} (${text!.length} chars)`);
    messages = [{ role: "user", content: buildExtractionPrompt(label, text!) }];
  }

  const response = await groq.chat.completions.create({
    model: useVision ? "meta-llama/llama-4-scout-17b-16e-instruct" : "llama-3.3-70b-versatile",
    messages: [{ role: "system", content: EXTRACTION_SYSTEM_PROMPT }, ...messages],
    temperature: 0,
    max_tokens: 8192,
    response_format: { type: "json_object" },
  });

  return cleanAndParseJSON(response.choices[0]?.message?.content || "");
}

// ── Gemini (fallback) ─────────────────────────────────────────────────────

async function extractWithGemini(
  apiKey: string, label: string, text: string | null, fileBuffer: Buffer, mimeType: string
): Promise<any> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const useVision = !text || text.length < 1000;
  const gemini = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite", systemInstruction: EXTRACTION_SYSTEM_PROMPT });

  const parts: any[] = useVision
    ? [{ inlineData: { mimeType, data: fileBuffer.toString("base64") } },
       { text: buildExtractionPrompt(label, "[See the attached document image above]") }]
    : [{ text: buildExtractionPrompt(label, text!) }];

  console.log(`  [Gemini] ${useVision ? "vision" : "text"}: ${label}`);
  const result = await gemini.generateContent({
    contents: [{ role: "user", parts }],
    generationConfig: { maxOutputTokens: 8192, temperature: 0, responseMimeType: "application/json" },
  });

  return cleanAndParseJSON(result.response.text());
}

// ── Extract with fallback ─────────────────────────────────────────────────

async function extractDoc(
  groqKey: string | undefined,
  geminiKey: string | undefined,
  label: string,
  text: string | null,
  buffer: Buffer,
  mimeType: string
): Promise<ExtractedDoc> {
  if (groqKey) {
    try {
      return await extractWithGroq(groqKey, label, text, buffer, mimeType);
    } catch (err: any) {
      console.log(`  Groq failed for ${label}: ${err.message?.substring(0, 100)}`);
      if (!geminiKey) throw err;
      console.log(`  Falling back to Gemini for ${label}`);
    }
  }
  if (geminiKey) return await extractWithGemini(geminiKey, label, text, buffer, mimeType);
  throw new Error("No API keys configured.");
}

// ── PDF text extraction ───────────────────────────────────────────────────

async function extractPdfText(buffer: Buffer): Promise<string | null> {
  try {
    const data = await pdfParse(buffer);
    const text = data.text.trim();
    return text.length >= 1000 ? text : null;
  } catch {
    return null;
  }
}

// ── Shipper/consignee swap detection ─────────────────────────────────────

function detectAndFixSwap(docs: ExtractedDoc[]) {
  if (docs.length < 2) return;
  const a = docs[0];
  const b = docs[1];
  const norm = (s: string | null | undefined) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

  if (
    norm(a.Exporter_name) && norm(a.Consignee_name) &&
    norm(a.Exporter_name) === norm(b.Consignee_name) &&
    norm(a.Consignee_name) === norm(b.Exporter_name)
  ) {
    const blIndex = docs.findIndex((d) => /lading|b\/l|hbl|hb\/l/i.test(d.document_type));
    const trustIndex = blIndex >= 0 ? blIndex : 1;
    const fixIndex = trustIndex === 0 ? 1 : 0;
    console.log(`  Detected exporter/consignee swap in "${docs[fixIndex].document_type}" — correcting`);
    [docs[fixIndex].Exporter_name, docs[fixIndex].Consignee_name] =
      [docs[fixIndex].Consignee_name, docs[fixIndex].Exporter_name];
    [docs[fixIndex].Exporter_address, docs[fixIndex].Consignee_address] =
      [docs[fixIndex].Consignee_address, docs[fixIndex].Exporter_address];
  }
}

// ── Main handler ──────────────────────────────────────────────────────────

/** Map MBL container size description to ISO type code. */
function resolveContainerType(goodsDesc: string): string {
  const d = goodsDesc.toUpperCase();
  if (d.includes("40") && (d.includes("HC") || d.includes("HIGH"))) return "45GP";
  if (d.includes("40")) return "42GP";
  if (d.includes("20")) return "22GP";
  return "45GP";
}

// ── Main handler ──────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const groqKey  = process.env.GROQ_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  const activeGroq   = groqKey   && groqKey   !== "your_groq_key_here"   ? groqKey   : undefined;
  const activeGemini = geminiKey && geminiKey !== "your_gemini_key_here" ? geminiKey : undefined;

  if (!activeGroq && !activeGemini) {
    return NextResponse.json(
      { error: "No API keys configured. Set GROQ_API_KEY or GEMINI_API_KEY in .env.local" },
      { status: 401 }
    );
  }

  try {
    const formData = await request.formData();
    const action = (formData.get("action") as string) || "compare";

    // ── Collect all uploaded files ──────────────────────────────────────────

    // HBLs: keys are hbl_0, hbl_1, hbl_2 ...
    // MBL:  key is mbl
    // XML:  key is xml_file
    // Labels: hbl_0_label, mbl_label

    const hblFiles: Array<{ label: string; buffer: Buffer; mimeType: string; text: string | null }> = [];
    let mblDoc: ExtractedDoc | null = null;
    let xmlString: string | null = null;

    for (const [key, value] of Array.from(formData.entries())) {
      if (!(value instanceof File) || value.size === 0) continue;

      const buffer = Buffer.from(await value.arrayBuffer());

      if (key === "xml_file") {
        xmlString = buffer.toString("utf-8");
        continue;
      }

      if (key === "mbl") {
        const label = (formData.get("mbl_label") as string) || "Master B/L";
        const text = value.type === "application/pdf" ? await extractPdfText(buffer) : null;
        mblDoc = await extractDoc(activeGroq, activeGemini, label, text, buffer, value.type);
        console.log(`  → MBL extracted: voyage=${mblDoc.Voyage_number}, ref=${mblDoc.Bol_reference}`);
        continue;
      }

      if (key.startsWith("hbl_") && !key.endsWith("_label")) {
        const label = (formData.get(`${key}_label`) as string) || `House B/L`;
        const text = value.type === "application/pdf" ? await extractPdfText(buffer) : null;
        hblFiles.push({ label, buffer, text, mimeType: value.type });
        continue;
      }
    }

    // ── PRESHIPMENT action ──────────────────────────────────────────────────
    if (action === "preshipment") {
      if (hblFiles.length < 2) {
        return NextResponse.json({ error: "Upload both a packing list and commercial invoice." }, { status: 400 });
      }
      console.log("Pre-shipment check: extracting packing list and invoice...");
      const [doc1, doc2] = await Promise.all([
        extractDoc(activeGroq, activeGemini, hblFiles[0].label, hblFiles[0].text, hblFiles[0].buffer, hblFiles[0].mimeType),
        extractDoc(activeGroq, activeGemini, hblFiles[1].label, hblFiles[1].text, hblFiles[1].buffer, hblFiles[1].mimeType),
      ]);
      detectAndFixSwap([doc1, doc2]);
      const result = comparePreShipment(doc1, doc2);
      return NextResponse.json(result);
    }

    // ── GENERATE XML action ─────────────────────────────────────────────────
    if (action === "generate_xml") {
      if (hblFiles.length === 0) {
        return NextResponse.json({ error: "Upload at least one HBL to generate XML." }, { status: 400 });
      }

      console.log(`Generating XML from ${hblFiles.length} HBL(s)...`);
      const extractedHbls = await Promise.all(
        hblFiles.map(({ label, text, buffer, mimeType }) =>
          extractDoc(activeGroq, activeGemini, label, text, buffer, mimeType)
        )
      );

      // Master data: prefer MBL extraction, fall back to first HBL
      const firstHbl = extractedHbls[0];
      const masterData: Partial<MasterBolData> = {
        Customs_office_code: "",
        Voyage_number:     mblDoc?.Voyage_number   || firstHbl?.Voyage_number   || "",
        Date_of_departure: mblDoc?.Date_of_departure || firstHbl?.Date_of_departure || "",
        Reference_number:  mblDoc?.Bol_reference   || "",
      };

      // Fill container/seal/type from MBL if HBLs don't have them
      const containerType = resolveContainerType(mblDoc?.Goods_description || "");
      for (const hbl of extractedHbls) {
        if (!hbl.Ctn_reference && mblDoc?.Ctn_reference) hbl.Ctn_reference = mblDoc.Ctn_reference;
        if (!hbl.Marks1 && mblDoc?.Marks1) hbl.Marks1 = mblDoc.Marks1;
        if (!hbl.Type_of_container) hbl.Type_of_container = containerType;
        if (!hbl.Carrier_code) hbl.Carrier_code = "FF006"; // your fixed carrier code
      }

      const xmlOutput = generateGensoftXml(masterData, extractedHbls);
      return new NextResponse(xmlOutput, {
        status: 200,
        headers: {
          "Content-Type": "application/xml",
          "Content-Disposition": `attachment; filename="Awbolds_export.xml"`,
        },
      });
    }

    // ── COMPARE action ──────────────────────────────────────────────────────
    if (hblFiles.length === 0 && !xmlString) {
      return NextResponse.json({ error: "Please upload at least one HBL." }, { status: 400 });
    }

    console.log(`Stage 1: Extracting ${hblFiles.length} HBL(s)...`);
    const extractedHbls: ExtractedDoc[] = await Promise.all(
      hblFiles.map(async ({ label, text, buffer, mimeType }) => {
        const doc = await extractDoc(activeGroq, activeGemini, label, text, buffer, mimeType);
        console.log(`  → ${label}: ref=${doc.Bol_reference}, pkgs=${doc.Number_of_packages}, exporter=${doc.Exporter_name}`);
        return doc;
      })
    );

    // ── XML comparison ──────────────────────────────────────────────────────
    if (xmlString) {
      console.log("Parsing XML...");
      const { master, hbls: xmlHbls } = parseGensoftXml(xmlString);

      // If MBL not uploaded, seed voyage/date from XML master into extracted HBLs for comparison
      for (const hbl of extractedHbls) {
        if (!hbl.Voyage_number && master.Voyage_number) hbl.Voyage_number = master.Voyage_number;
      }

      // Match each XML Bol_segment to the corresponding uploaded HBL by Bol_reference
      const allDiscrepancies: any[] = [];
      const allMatches: string[] = [];
      let comparedCount = 0;

      for (const xmlHbl of xmlHbls) {
        // Try to find matching uploaded HBL by Bol_reference
        const match = extractedHbls.find(
          (h) => h.Bol_reference && xmlHbl.Bol_reference &&
                 h.Bol_reference.replace(/\s/g, "").toUpperCase() ===
                 xmlHbl.Bol_reference.replace(/\s/g, "").toUpperCase()
        ) || extractedHbls[comparedCount]; // fallback: positional

        if (!match) continue;

        // Label the XML doc with its B/L ref for display
        xmlHbl.document_type = `XML: ${xmlHbl.Bol_reference || "Segment " + (comparedCount + 1)}`;

        detectAndFixSwap([match, xmlHbl]);

        const result = compareDocuments(match, xmlHbl);
        allDiscrepancies.push(...result.discrepancies);
        for (const m of result.matches) {
          if (!allMatches.includes(m)) allMatches.push(m);
        }
        comparedCount++;
      }

      // If no XML segments matched at all, just compare positionally
      if (comparedCount === 0 && xmlHbls.length > 0 && extractedHbls.length > 0) {
        xmlHbls[0].document_type = `XML: ${xmlHbls[0].Bol_reference || "Segment 1"}`;
        detectAndFixSwap([extractedHbls[0], xmlHbls[0]]);
        const result = compareDocuments(extractedHbls[0], xmlHbls[0]);
        allDiscrepancies.push(...result.discrepancies);
        allMatches.push(...result.matches);
      }

      const criticalCount = allDiscrepancies.filter((d: any) => d.severity === "critical").length;
      const warningCount  = allDiscrepancies.filter((d: any) => d.severity === "warning").length;
      const summary = allDiscrepancies.length === 0
        ? "No discrepancies found between HBL(s) and XML."
        : criticalCount > 0
          ? `Found ${criticalCount} critical issue${criticalCount > 1 ? "s" : ""}${warningCount > 0 ? ` and ${warningCount} warning${warningCount > 1 ? "s" : ""}` : ""} between HBL(s) and XML.`
          : `Found ${allDiscrepancies.length} minor issue${allDiscrepancies.length > 1 ? "s" : ""} — no critical problems.`;

      return NextResponse.json({ summary, discrepancies: allDiscrepancies, matches: allMatches });
    }

    // ── HBL vs MBL comparison ───────────────────────────────────────────────
    // Build comparison pairs
    // If MBL present: compare each HBL against MBL
    // If multiple HBLs only: compare each against the first (or all pairs)
    const allDiscrepancies: any[] = [];
    const allMatches: string[] = [];

    if (mblDoc) {
      // Compare each HBL against MBL
      for (const hbl of extractedHbls) {
        detectAndFixSwap([hbl, mblDoc]);
        const result = compareDocuments(hbl, mblDoc);
        allDiscrepancies.push(...result.discrepancies);
        for (const m of result.matches) {
          if (!allMatches.includes(m)) allMatches.push(m);
        }
      }
    } else if (extractedHbls.length >= 2) {
      // Compare all HBLs against the first one
      const base = extractedHbls[0];
      for (let i = 1; i < extractedHbls.length; i++) {
        detectAndFixSwap([base, extractedHbls[i]]);
        const result = compareDocuments(base, extractedHbls[i]);
        allDiscrepancies.push(...result.discrepancies);
        for (const m of result.matches) {
          if (!allMatches.includes(m)) allMatches.push(m);
        }
      }
    } else {
      return NextResponse.json({ error: "Upload at least 2 documents to compare." }, { status: 400 });
    }

    // Deduplicate and sort
    const seen = new Set<string>();
    const deduped = allDiscrepancies.filter((d: any) => {
      const key = `${d.field}|${d.doc1_value}|${d.doc2_value}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const order: Record<string, number> = { critical: 0, warning: 1, info: 2 };
    deduped.sort((a: any, b: any) => order[a.severity] - order[b.severity]);

    const criticalCount = deduped.filter((d: any) => d.severity === "critical").length;
    const warningCount  = deduped.filter((d: any) => d.severity === "warning").length;
    const summary = deduped.length === 0
      ? "No discrepancies found. All comparable fields match."
      : criticalCount > 0
        ? `Found ${criticalCount} critical issue${criticalCount > 1 ? "s" : ""} requiring action.${warningCount > 0 ? ` Also ${warningCount} warning${warningCount > 1 ? "s" : ""} to review.` : ""}`
        : `Found ${deduped.length} minor issue${deduped.length > 1 ? "s" : ""} to review — no critical problems.`;

    console.log(`Done: ${deduped.length} discrepancies, ${allMatches.length} matches`);
    return NextResponse.json({ summary, discrepancies: deduped, matches: allMatches });

  } catch (err: any) {
    console.error("API error:", err);
    if (err?.status === 429 || err?.message?.includes("429")) {
      return NextResponse.json({ error: "Rate limited. Wait a minute and try again." }, { status: 429 });
    }
    return NextResponse.json({ error: err?.message || "Something went wrong." }, { status: 500 });
  }
}
