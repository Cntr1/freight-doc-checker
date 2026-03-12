import type { ComparisonResult, Discrepancy, Severity, ExtractedDoc } from "./types";

// Port code → normalised name lookup
// Expand this as new routes are added
const PORT_CODE_MAP: Record<string, string> = {
  INNSA: "nhavasheva",
  INBOM: "mumbai",
  LKCMB: "colombo",
  SGSIN: "singapore",
  CNNGB: "ningbo",
  CNSHA: "shanghai",
  CNSZU: "shenzhen",
  HKHKG: "hongkong",
  MYTPP: "portklang",
  AEJEA: "jebelalidubai",
  USLAX: "losangeles",
  USNYC: "newyork",
};

function addDiscrepancy(
  discrepancies: Discrepancy[],
  field: string,
  severity: Severity,
  doc1Label: string,
  doc1Value: string,
  doc2Label: string,
  doc2Value: string,
  note: string
) {
  discrepancies.push({ field, severity, doc1_label: doc1Label, doc1_value: doc1Value, doc2_label: doc2Label, doc2_value: doc2Value, note });
}

function normalize(val: string | null | undefined): string {
  if (!val) return "";
  return val.toString().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizePort(val: string | null | undefined): string {
  if (!val) return "";
  const raw = val.toString().trim();

  // If it looks like a UN/LOCODE (5 uppercase letters), map it
  if (/^[A-Z]{5}$/.test(raw) && PORT_CODE_MAP[raw]) {
    return PORT_CODE_MAP[raw];
  }

  // Otherwise strip country suffix and normalize
  let s = raw.toLowerCase();
  s = s.replace(/,?\s*(china|india|sri\s*lanka|singapore|malaysia|usa|uk|japan|korea|thailand|indonesia|vietnam|philippines|hong\s*kong|taiwan|bangladesh|pakistan|myanmar|cambodia|egypt|turkey|brazil|mexico|germany|netherlands|belgium|france|italy|spain|uae|saudi\s*arabia|oman|qatar|kenya|south\s*africa|australia|new\s*zealand|canada|p\.?r\.?c\.?|srilanka)\.?\s*$/i, "");
  s = s.replace(/[^a-z0-9]/g, "");

  // Map common name variants to canonical form
  if (s === "nhavasheva" || s === "nhabasheva" || s === "nseva") return "nhavasheva";
  if (s === "colombo") return "colombo";

  return s;
}

function normalizeSpaced(val: string | null | undefined): string {
  if (!val) return "";
  return val.toString().replace(/\s+/g, " ").trim();
}

function bothHaveValue(a: any, b: any): boolean {
  if (a === null || a === undefined || a === "" || a === "null") return false;
  if (b === null || b === undefined || b === "" || b === "null") return false;
  return true;
}

/**
 * Normalise a field value for XML-aware comparison.
 * Applies the same sanitisation that xml-generator uses, so HBL raw text
 * and Gensoft XML text compare as equal when they represent the same data.
 */
function normalizeForXml(val: string | null | undefined): string {
  if (!val) return "";
  // Strip pallet count and weight table preambles (same logic as xml-generator)
  const cleaned = val
    .replace(/^(ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|\d+)\s+PALLETS?\s+ONLY\s*/i, "")
    .replace(/\bGR\.?\s*WT\.?\\?KGS?\b\s*[\d.,]*/gi, "")
    .replace(/\bNET\.?\s*WT\.?\\?KGS?\b\s*[\d.,]+\s*/gi, "")
    .replace(/\bTOTAL\s+\d+\s+PACKAGES?\s+[\d.,]+\s*/gi, "")
    .trim();
  return cleaned
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\[p\\?r+l\.?/gi, "pvt")
    .replace(/\[([a-z]+)\]/gi, "$1")
    .replace(/\binvoice\s*no[:\s]+/gi, "invoiceno")
    .replace(/\bhs\s*code[;:\s]+/gi, "hscode")
    .replace(/\bs\/bill\s*no[:\s]+/gi, "sbillno")
    .replace(/(\d+mm)\s+([a-z])\b/gi, "$1$2")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function compareField(
  doc1: ExtractedDoc,
  doc2: ExtractedDoc,
  field: string,
  label: string,
  severity: Severity,
  discrepancies: Discrepancy[],
  matches: string[]
): void {
  const v1 = doc1[field];
  const v2 = doc2[field];
  if (!bothHaveValue(v1, v2)) return;

  const isPortField =
    field === "Place_of_loading_code" ||
    field === "Place_of_unloading_code" ||
    field === "Place_of_delivery";

  const isXmlComparison =
    doc1.document_type.startsWith("XML:") ||
    doc2.document_type.startsWith("XML:") ||
    doc1.document_type.includes("(XML)") ||
    doc2.document_type.includes("(XML)");

  const norm1 = isPortField
    ? normalizePort(String(v1))
    : isXmlComparison
      ? normalizeForXml(String(v1))
      : normalize(String(v1));

  const norm2 = isPortField
    ? normalizePort(String(v2))
    : isXmlComparison
      ? normalizeForXml(String(v2))
      : normalize(String(v2));

  if (norm1 === norm2) {
    matches.push(label);
  } else {
    addDiscrepancy(
      discrepancies, label, severity,
      doc1.document_type, normalizeSpaced(String(v1)),
      doc2.document_type, normalizeSpaced(String(v2)),
      `${label} differs between documents.`
    );
  }
}

function itemDisplayLabel(item: any): string {
  const code = item.item_code || null;
  const desc = item.description ? normalizeSpaced(item.description) : null;
  if (code && desc) return `${code} — ${desc}`;
  if (code) return String(code);
  if (desc) return desc;
  return "Unknown item";
}

function itemShortLabel(item: any): string {
  return item.item_code || item.po_number || item.description || "Item";
}

function matchItems(items1: any[], items2: any[]) {
  const matched: Array<{ item1: any; item2: any }> = [];
  const used2 = new Set<number>();

  for (const item1 of items1) {
    let bestMatch = -1;
    let bestScore = 0;

    for (let j = 0; j < items2.length; j++) {
      if (used2.has(j)) continue;
      const item2 = items2[j];
      let score = 0;

      if (item1.item_code && item2.item_code) {
        const c1 = normalize(String(item1.item_code));
        const c2 = normalize(String(item2.item_code));
        if (c1 && c2 && (c1 === c2 || c1.includes(c2) || c2.includes(c1))) score += 10;
      }
      if (item1.po_number && item2.po_number) {
        if (normalize(String(item1.po_number)) === normalize(String(item2.po_number))) score += 5;
      }
      if (item1.quantity && item2.quantity && Number(item1.quantity) === Number(item2.quantity)) score += 3;

      const desc1Words = normalize(item1.description || "").match(/.{2,}/g) || [];
      const desc2Norm = normalize(item2.description || "");
      let overlap = 0;
      for (const w of desc1Words) { if (desc2Norm.includes(w)) overlap++; }
      if (overlap > 0) score += Math.min(overlap, 3);

      if (score > bestScore) { bestScore = score; bestMatch = j; }
    }

    if (bestMatch >= 0 && bestScore >= 3) {
      matched.push({ item1, item2: items2[bestMatch] });
      used2.add(bestMatch);
    }
  }

  return {
    matched,
    onlyInDoc1: items1.filter((item1) => !matched.some((m) => m.item1 === item1)),
    onlyInDoc2: items2.filter((_, j) => !used2.has(j)),
  };
}

export function compareDocuments(doc1: ExtractedDoc, doc2: ExtractedDoc): ComparisonResult {
  const discrepancies: Discrepancy[] = [];
  const matches: string[] = [];

  // Field name → display label → severity
  const fieldPairs: Array<[string, string, Severity]> = [
    ["Exporter_name",          "Exporter / Shipper",      "critical"],
    ["Exporter_address",       "Exporter Address",        "warning"],
    ["Consignee_name",         "Consignee",               "critical"],
    ["Consignee_address",      "Consignee Address",       "info"],
    ["Notify_name",            "Notify Party",            "warning"],
    ["Carrier_name",           "Carrier / Delivery Agent","warning"],
    ["Vessel_name",            "Vessel Name",             "critical"],
    ["Voyage_number",          "Voyage Number",           "critical"],
    ["Place_of_loading_code",  "Port of Loading",         "critical"],
    ["Place_of_unloading_code","Port of Discharge",       "critical"],
    ["Place_of_delivery",      "Place of Delivery",       "warning"],
    ["Freight_terms",          "Freight Terms",           "warning"],
    ["Ctn_reference",          "Container Number",        "critical"],
    ["Marks1",                 "Seal Number",             "warning"],
    ["Goods_description",      "Goods Description",       "warning"],
  ];

  for (const [field, label, severity] of fieldPairs) {
    compareField(doc1, doc2, field, label, severity, discrepancies, matches);
  }

  // Date
  if (bothHaveValue(doc1.Date_of_departure, doc2.Date_of_departure)) {
    if (normalize(doc1.Date_of_departure) !== normalize(doc2.Date_of_departure)) {
      addDiscrepancy(
        discrepancies, "Date of Departure", "info",
        doc1.document_type, String(doc1.Date_of_departure),
        doc2.document_type, String(doc2.Date_of_departure),
        "Dates differ — may be normal across document types."
      );
    } else {
      matches.push("Date of Departure");
    }
  }

  // Package count
  if (bothHaveValue(doc1.Number_of_packages, doc2.Number_of_packages)) {
    const n1 = Number(doc1.Number_of_packages);
    const n2 = Number(doc2.Number_of_packages);
    if (!isNaN(n1) && !isNaN(n2)) {
      if (n1 !== n2) {
        addDiscrepancy(
          discrepancies, "Number of Packages", "critical",
          doc1.document_type, String(n1),
          doc2.document_type, String(n2),
          "Package count mismatch."
        );
      } else {
        matches.push("Number of Packages");
      }
    }
  }

  // Gross mass — any difference = critical
  if (bothHaveValue(doc1.Gross_mass, doc2.Gross_mass)) {
    const w1 = parseFloat(String(doc1.Gross_mass).replace(/[^0-9.]/g, ""));
    const w2 = parseFloat(String(doc2.Gross_mass).replace(/[^0-9.]/g, ""));
    if (!isNaN(w1) && !isNaN(w2)) {
      if (w1 !== w2) {
        addDiscrepancy(
          discrepancies, "Gross Mass (KGS)", "critical",
          doc1.document_type, String(w1),
          doc2.document_type, String(w2),
          "Gross weight mismatch — must be resolved."
        );
      } else {
        matches.push("Gross Mass (KGS)");
      }
    }
  }

  // CBM — 5% threshold
  if (bothHaveValue(doc1.Volume_in_cubic_meters, doc2.Volume_in_cubic_meters)) {
    const c1 = parseFloat(String(doc1.Volume_in_cubic_meters));
    const c2 = parseFloat(String(doc2.Volume_in_cubic_meters));
    if (!isNaN(c1) && !isNaN(c2) && c1 > 0 && c2 > 0) {
      const pct = Math.abs(c1 - c2) / Math.max(c1, c2);
      if (pct === 0) {
        matches.push("Volume (CBM)");
      } else {
        addDiscrepancy(
          discrepancies, "Volume (CBM)", pct > 0.05 ? "critical" : "warning",
          doc1.document_type, String(c1),
          doc2.document_type, String(c2),
          pct > 0.05 ? "CBM mismatch." : "CBM difference — possible rounding."
        );
      }
    }
  }

  // ── Item-level comparison ──────────────────────────────────────────────────
  const items1 = doc1.items || [];
  const items2 = doc2.items || [];

  if (items1.length > 0 && items2.length > 0) {
    const isBlankItems = (items: any[]) =>
      items.every((it: any) => !it.item_code && (!it.quantity || it.quantity === 0));

    const isCombinedDoc1 =
      (items1.length === 1 && items2.length > 1 && !items1[0].item_code) ||
      (items1.length >= 1 && items2.length > 1 && isBlankItems(items1) && !isBlankItems(items2));
    const isCombinedDoc2 =
      (items2.length === 1 && items1.length > 1 && !items2[0].item_code) ||
      (items2.length >= 1 && items1.length > 1 && isBlankItems(items2) && !isBlankItems(items1));

    if (isCombinedDoc1 || isCombinedDoc2) {
      const detailedItems = isCombinedDoc1 ? items2 : items1;
      const combinedItems = isCombinedDoc1 ? items1 : items2;
      const detailedDocType = isCombinedDoc1 ? doc2.document_type : doc1.document_type;
      const combinedDocType = isCombinedDoc1 ? doc1.document_type : doc2.document_type;

      const allCombinedDescs = combinedItems.map((it: any) => normalize(it.description || "")).join(" ");
      for (const item of detailedItems) {
        const keywords = (item.description || "").toLowerCase().split(/[\s,/]+/).filter((w: string) => w.length >= 3);
        if (!keywords.some((kw: string) => allCombinedDescs.includes(normalize(kw)))) {
          addDiscrepancy(
            discrepancies, `Missing from ${combinedDocType} description`, "critical",
            detailedDocType, itemDisplayLabel(item),
            combinedDocType, combinedItems.map((it: any) => normalizeSpaced(it.description || "")).join(", "),
            `Item not mentioned in ${combinedDocType} goods description.`
          );
        }
      }

      const allDetailedDescs = detailedItems.map((it: any) => normalize(it.description || "")).join(" ");
      for (const cItem of combinedItems) {
        const cKeywords = (cItem.description || "").toLowerCase().split(/[\s,/]+/).filter((w: string) => w.length >= 3);
        if (cKeywords.length > 0 && !cKeywords.some((kw: string) => allDetailedDescs.includes(normalize(kw)))) {
          addDiscrepancy(
            discrepancies, `Item on ${combinedDocType} not found in ${detailedDocType}`, "critical",
            detailedDocType, detailedItems.map((it: any) => normalizeSpaced(it.description || "")).join(", "),
            combinedDocType, normalizeSpaced(cItem.description || ""),
            `${combinedDocType} mentions goods not found in ${detailedDocType}.`
          );
        }
      }
      matches.push(`Goods description cross-checked against ${combinedDocType}`);

    } else {
      const { matched, onlyInDoc1, onlyInDoc2 } = matchItems(items1, items2);

      for (const item of onlyInDoc1) {
        addDiscrepancy(discrepancies, "Missing Item", "critical",
          doc1.document_type, `${itemDisplayLabel(item)} — Qty: ${item.quantity ?? "?"}`,
          doc2.document_type, "NOT FOUND",
          `Item in ${doc1.document_type} missing from ${doc2.document_type}.`
        );
      }
      for (const item of onlyInDoc2) {
        addDiscrepancy(discrepancies, "Missing Item", "critical",
          doc1.document_type, "NOT FOUND",
          doc2.document_type, `${itemDisplayLabel(item)} — Qty: ${item.quantity ?? "?"}`,
          `Item in ${doc2.document_type} missing from ${doc1.document_type}.`
        );
      }

      for (const { item1, item2 } of matched) {
        const label = itemShortLabel(item1);
        const q1 = Number(item1.quantity);
        const q2 = Number(item2.quantity);
        if (!isNaN(q1) && !isNaN(q2)) {
          if (q1 !== q2) {
            addDiscrepancy(discrepancies, `Quantity — ${label}`, "critical",
              doc1.document_type, `${q1} ${item1.quantity_unit || ""}`.trim(),
              doc2.document_type, `${q2} ${item2.quantity_unit || ""}`.trim(),
              "Quantity mismatch — must be resolved."
            );
          } else {
            matches.push(`Quantity — ${label}`);
          }
        }

        if (bothHaveValue(item1.description, item2.description)) {
          if (normalize(item1.description) !== normalize(item2.description)) {
            addDiscrepancy(discrepancies, `Description — ${label}`, "warning",
              doc1.document_type, normalizeSpaced(item1.description),
              doc2.document_type, normalizeSpaced(item2.description),
              "Description wording differs — verify if acceptable."
            );
          } else {
            matches.push(`Description — ${label}`);
          }
        }
      }

      if (matched.length > 0 && onlyInDoc1.length === 0 && onlyInDoc2.length === 0) {
        matches.push("All items present in both documents");
      }
    }
  }

  const severityOrder: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
  discrepancies.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  const criticalCount = discrepancies.filter((d) => d.severity === "critical").length;
  const warningCount = discrepancies.filter((d) => d.severity === "warning").length;

  let summary: string;
  if (discrepancies.length === 0) {
    summary = "No discrepancies found. All comparable fields match between the documents.";
  } else if (criticalCount > 0) {
    summary = `Found ${criticalCount} critical issue${criticalCount > 1 ? "s" : ""} requiring action.${warningCount > 0 ? ` Also ${warningCount} warning${warningCount > 1 ? "s" : ""} to review.` : ""}`;
  } else {
    summary = `Found ${discrepancies.length} minor issue${discrepancies.length > 1 ? "s" : ""} to review — no critical problems.`;
  }

  return { summary, discrepancies, matches };
}
