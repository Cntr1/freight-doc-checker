import type { ComparisonResult, Discrepancy, Severity } from "./types";

interface ExtractedDoc {
  document_type: string;
  [key: string]: any;
}

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
  discrepancies.push({
    field,
    severity,
    doc1_label: doc1Label,
    doc1_value: doc1Value,
    doc2_label: doc2Label,
    doc2_value: doc2Value,
    note,
  });
}

// Strip everything except alphanumeric for comparison
function normalize(val: string | null | undefined): string {
  if (!val) return "";
  return val.toString().toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Normalize but keep spaces (for readable display)
function normalizeSpaced(val: string | null | undefined): string {
  if (!val) return "";
  let s = val.toString().replace(/\s+/g, " ").trim();
  // Fix missing spaces before capital letters (pdf-parse artifact)
  // "metalhookforHARNESSBALANCE" → "metalhookfor HARNESS BALANCE"
  s = s.replace(/([a-z])([A-Z])/g, "$1 $2");
  // Fix runs of uppercase that should be spaced: "HARNESSBALANCE" → "HARNESS BALANCE"  
  // Only split when transitioning from uppercase run to new uppercase word
  s = s.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
  return s;
}

function bothHaveValue(a: any, b: any): boolean {
  if (a === null || a === undefined || a === "" || a === "null") return false;
  if (b === null || b === undefined || b === "" || b === "null") return false;
  return true;
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

  if (normalize(String(v1)) === normalize(String(v2))) {
    matches.push(label);
  } else {
    addDiscrepancy(
      discrepancies,
      label,
      severity,
      doc1.document_type,
      normalizeSpaced(String(v1)),
      doc2.document_type,
      normalizeSpaced(String(v2)),
      `${label} differs between documents.`
    );
  }
}

// Build a readable label for an item like "71414 — Metal hooks"
function itemDisplayLabel(item: any): string {
  const code = item.item_code || null;
  const desc = item.description ? normalizeSpaced(item.description) : null;
  if (code && desc) return `${code} — ${desc}`;
  if (code) return String(code);
  if (desc) return desc;
  return "Unknown item";
}

// Short label for field names like "71414"
function itemShortLabel(item: any): string {
  return item.item_code || item.po_number || item.description || "Item";
}

function matchItems(
  items1: any[],
  items2: any[]
): {
  matched: Array<{ item1: any; item2: any }>;
  onlyInDoc1: any[];
  onlyInDoc2: any[];
} {
  const matched: Array<{ item1: any; item2: any }> = [];
  const used2 = new Set<number>();

  for (const item1 of items1) {
    let bestMatch = -1;
    let bestScore = 0;

    for (let j = 0; j < items2.length; j++) {
      if (used2.has(j)) continue;
      const item2 = items2[j];
      let score = 0;

      // Match by item code (strongest signal)
      if (item1.item_code && item2.item_code) {
        const code1 = normalize(String(item1.item_code));
        const code2 = normalize(String(item2.item_code));
        if (code1 && code2 && (code1 === code2 || code1.includes(code2) || code2.includes(code1))) {
          score += 10;
        }
      }

      // Match by PO number
      if (item1.po_number && item2.po_number) {
        if (normalize(String(item1.po_number)) === normalize(String(item2.po_number))) {
          score += 5;
        }
      }

      // Match by quantity
      if (item1.quantity && item2.quantity && Number(item1.quantity) === Number(item2.quantity)) {
        score += 3;
      }

      // Match by description word overlap
      const desc1Words = normalize(item1.description || "").match(/.{2,}/g) || [];
      const desc2Norm = normalize(item2.description || "");
      let overlap = 0;
      for (const w of desc1Words) {
        if (desc2Norm.includes(w)) overlap++;
      }
      if (overlap > 0) score += Math.min(overlap, 3);

      if (score > bestScore) {
        bestScore = score;
        bestMatch = j;
      }
    }

    if (bestMatch >= 0 && bestScore >= 3) {
      matched.push({ item1, item2: items2[bestMatch] });
      used2.add(bestMatch);
    }
  }

  const onlyInDoc1 = items1.filter(
    (item1) => !matched.some((m) => m.item1 === item1)
  );
  const onlyInDoc2 = items2.filter(
    (_, j) => !used2.has(j)
  );

  return { matched, onlyInDoc1, onlyInDoc2 };
}

export function compareDocuments(
  doc1: ExtractedDoc,
  doc2: ExtractedDoc
): ComparisonResult {
  const discrepancies: Discrepancy[] = [];
  const matches: string[] = [];

  // Compare header fields (only if BOTH documents have them)
  const fieldPairs: Array<[string, string, Severity]> = [
    ["shipper", "Shipper / Seller", "critical"],
    ["shipper_address", "Shipper Address", "warning"],
    ["consignee", "Consignee / Buyer", "critical"],
    ["consignee_address", "Consignee Address", "info"],
    ["notify_party", "Notify Party", "warning"],
    ["vessel", "Vessel Name", "critical"],
    ["voyage", "Voyage Number", "critical"],
    ["port_of_loading", "Port of Loading", "critical"],
    ["port_of_discharge", "Port of Discharge", "critical"],
    ["place_of_delivery", "Place of Delivery", "warning"],
    ["freight_terms", "Freight / Delivery Terms", "warning"],
    ["delivery_terms", "Delivery Terms", "warning"],
    ["payment_terms", "Payment Terms", "info"],
  ];

  for (const [field, label, severity] of fieldPairs) {
    compareField(doc1, doc2, field, label, severity, discrepancies, matches);
  }

  // Dates — always info since different doc types naturally have different dates
  if (bothHaveValue(doc1.date, doc2.date)) {
    if (normalize(doc1.date) !== normalize(doc2.date)) {
      addDiscrepancy(
        discrepancies,
        "Date",
        "info",
        doc1.document_type,
        doc1.date,
        doc2.document_type,
        doc2.date,
        "Dates differ — may be normal for different document types."
      );
    } else {
      matches.push("Date");
    }
  }

  // Compare line items
  const items1 = doc1.items || [];
  const items2 = doc2.items || [];

  if (items1.length > 0 && items2.length > 0) {
    // Detect combined-description documents (like B/Ls):
    // - Single item with no code, OR
    // - Multiple items but ALL have no item_code and no quantity (just descriptions)
    const isBlankItems = (items: any[]) =>
      items.every((it: any) => !it.item_code && (!it.quantity || it.quantity === 0 || it.quantity === "?"));

    const isCombinedDoc1 =
      (items1.length === 1 && items2.length > 1 && !items1[0].item_code) ||
      (items1.length >= 1 && items2.length > 1 && isBlankItems(items1) && !isBlankItems(items2));
    const isCombinedDoc2 =
      (items2.length === 1 && items1.length > 1 && !items2[0].item_code) ||
      (items2.length >= 1 && items1.length > 1 && isBlankItems(items2) && !isBlankItems(items1));

    if (isCombinedDoc1 || isCombinedDoc2) {
      // One doc has individual items, the other has a combined description (like a B/L)
      const detailedItems = isCombinedDoc1 ? items2 : items1;
      const combinedItems = isCombinedDoc1 ? items1 : items2;
      const detailedDocType = isCombinedDoc1 ? doc2.document_type : doc1.document_type;
      const combinedDocType = isCombinedDoc1 ? doc1.document_type : doc2.document_type;

      // Build one big string from all combined items' descriptions
      const allCombinedDescs = combinedItems
        .map((it: any) => normalize(it.description || ""))
        .join(" ");

      // Check each detailed item's key words appear somewhere in the combined descriptions
      for (const item of detailedItems) {
        const keywords = (item.description || "")
          .toLowerCase()
          .split(/[\s,/]+/)
          .filter((w: string) => w.length >= 3);

        const foundInCombined = keywords.some((kw: string) => allCombinedDescs.includes(normalize(kw)));

        if (!foundInCombined) {
          addDiscrepancy(
            discrepancies,
            `Missing from ${combinedDocType} description`,
            "critical",
            detailedDocType,
            `${itemDisplayLabel(item)}`,
            combinedDocType,
            combinedItems.map((it: any) => normalizeSpaced(it.description || "")).join(", "),
            `Item not mentioned in ${combinedDocType} goods description.`
          );
        }
      }

      // Reverse check: see if combined doc mentions goods NOT in the detailed doc
      const allDetailedDescs = detailedItems
        .map((it: any) => normalize(it.description || ""))
        .join(" ");

      for (const cItem of combinedItems) {
        const cKeywords = (cItem.description || "")
          .toLowerCase()
          .split(/[\s,/]+/)
          .filter((w: string) => w.length >= 3);

        const foundInDetailed = cKeywords.some((kw: string) => allDetailedDescs.includes(normalize(kw)));

        if (!foundInDetailed && cKeywords.length > 0) {
          addDiscrepancy(
            discrepancies,
            `Item on ${combinedDocType} not found in ${detailedDocType}`,
            "critical",
            detailedDocType,
            detailedItems.map((it: any) => normalizeSpaced(it.description || "")).join(", "),
            combinedDocType,
            normalizeSpaced(cItem.description || ""),
            `${combinedDocType} mentions goods not found in ${detailedDocType}.`
          );
        }
      }

      matches.push(`Goods description cross-checked against ${combinedDocType}`);

    } else {
      // Normal item-by-item comparison
      const { matched, onlyInDoc1, onlyInDoc2 } = matchItems(items1, items2);

      for (const item of onlyInDoc1) {
        addDiscrepancy(
          discrepancies,
          "Missing Item",
          "critical",
          doc1.document_type,
          `${itemDisplayLabel(item)} — Qty: ${item.quantity || "?"}`,
          doc2.document_type,
          "NOT FOUND",
          `Item in ${doc1.document_type} missing from ${doc2.document_type}.`
        );
      }

      for (const item of onlyInDoc2) {
        addDiscrepancy(
          discrepancies,
          "Missing Item",
          "critical",
          doc1.document_type,
          "NOT FOUND",
          doc2.document_type,
          `${itemDisplayLabel(item)} — Qty: ${item.quantity || "?"}`,
          `Item in ${doc2.document_type} missing from ${doc1.document_type}.`
        );
      }

      for (const { item1, item2 } of matched) {
        const label = itemShortLabel(item1);

        const q1 = Number(item1.quantity);
        const q2 = Number(item2.quantity);
        if (!isNaN(q1) && !isNaN(q2)) {
          if (q1 !== q2) {
            addDiscrepancy(
              discrepancies,
              `Quantity — ${label}`,
              "critical",
              doc1.document_type,
              `${q1} ${item1.quantity_unit || ""}`.trim(),
              doc2.document_type,
              `${q2} ${item2.quantity_unit || ""}`.trim(),
              "Quantity mismatch — must be resolved."
            );
          } else {
            matches.push(`Quantity — ${label}`);
          }
        }

        if (bothHaveValue(item1.description, item2.description)) {
          if (normalize(item1.description) !== normalize(item2.description)) {
            addDiscrepancy(
              discrepancies,
              `Description — ${label}`,
              "warning",
              doc1.document_type,
              normalizeSpaced(item1.description),
              doc2.document_type,
              normalizeSpaced(item2.description),
              "Description wording differs — verify if acceptable."
            );
          } else {
            matches.push(`Description — ${label}`);
          }
        }

        if (bothHaveValue(item1.gross_weight, item2.gross_weight)) {
          if (Number(item1.gross_weight) !== Number(item2.gross_weight)) {
            addDiscrepancy(
              discrepancies,
              `Gross Weight — ${label}`,
              "critical",
              doc1.document_type,
              String(item1.gross_weight),
              doc2.document_type,
              String(item2.gross_weight),
              "Weight mismatch."
            );
          } else {
            matches.push(`Gross Weight — ${label}`);
          }
        }

        if (bothHaveValue(item1.net_weight, item2.net_weight)) {
          if (Number(item1.net_weight) !== Number(item2.net_weight)) {
            addDiscrepancy(
              discrepancies,
              `Net Weight — ${label}`,
              "critical",
              doc1.document_type,
              String(item1.net_weight),
              doc2.document_type,
              String(item2.net_weight),
              "Weight mismatch."
            );
          } else {
            matches.push(`Net Weight — ${label}`);
          }
        }

        if (bothHaveValue(item1.cbm, item2.cbm)) {
          if (Number(item1.cbm) !== Number(item2.cbm)) {
            addDiscrepancy(
              discrepancies,
              `CBM — ${label}`,
              "warning",
              doc1.document_type,
              String(item1.cbm),
              doc2.document_type,
              String(item2.cbm),
              "Measurement mismatch."
            );
          } else {
            matches.push(`CBM — ${label}`);
          }
        }
      }

      if (matched.length > 0 && onlyInDoc1.length === 0 && onlyInDoc2.length === 0) {
        matches.push("All items present in both documents");
      }
    }
  }

  const totalFields: Array<[string, string]> = [
    ["total_gross_weight", "Total Gross Weight"],
    ["total_net_weight", "Total Net Weight"],
    ["total_cbm", "Total CBM"],
    ["total_cartons", "Total Cartons"],
    ["total_value", "Total Value"],
  ];

  for (const [field, label] of totalFields) {
    if (bothHaveValue(doc1[field], doc2[field])) {
      // Parse numeric values, stripping units like "KGS", "CBM"
      const num1 = parseFloat(String(doc1[field]).replace(/[^0-9.]/g, ""));
      const num2 = parseFloat(String(doc2[field]).replace(/[^0-9.]/g, ""));

      if (!isNaN(num1) && !isNaN(num2)) {
        if (num1 === num2) {
          matches.push(label);
        } else {
          // Small differences (rounding) = warning, big differences = critical
          const diff = Math.abs(num1 - num2);
          const pct = diff / Math.max(num1, num2);
          const severity: Severity = field.toLowerCase().includes("weight") || pct > 0.05 ? "critical" : "warning";

          addDiscrepancy(
            discrepancies,
            label,
            severity,
            doc1.document_type,
            String(doc1[field]),
            doc2.document_type,
            String(doc2[field]),
            `${label} mismatch${severity === "warning" ? " (possible rounding)" : ""}.`
          );
        }
      } else if (normalize(String(doc1[field])) !== normalize(String(doc2[field]))) {
        addDiscrepancy(
          discrepancies,
          label,
          "warning",
          doc1.document_type,
          String(doc1[field]),
          doc2.document_type,
          String(doc2[field]),
          `${label} differs.`
        );
      } else {
        matches.push(label);
      }
    }
  }

  // Sort: critical first, then warning, then info
  const severityOrder: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
  discrepancies.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  // Summary
  const criticalCount = discrepancies.filter((d) => d.severity === "critical").length;
  const warningCount = discrepancies.filter((d) => d.severity === "warning").length;

  let summary: string;
  if (discrepancies.length === 0) {
    summary = "No discrepancies found. All comparable fields match between the documents.";
  } else if (criticalCount > 0) {
    summary = `Found ${criticalCount} critical issue${criticalCount > 1 ? "s" : ""} requiring action.${
      warningCount > 0 ? ` Also ${warningCount} warning${warningCount > 1 ? "s" : ""} to review.` : ""
    }`;
  } else {
    summary = `Found ${discrepancies.length} minor issue${discrepancies.length > 1 ? "s" : ""} to review — no critical problems.`;
  }

  return { summary, discrepancies, matches };
}