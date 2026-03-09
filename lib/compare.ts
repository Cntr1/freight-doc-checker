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

function normalize(val: string | null | undefined): string {
  if (!val) return "";
  return val.toString().toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

function bothHaveValue(a: any, b: any): boolean {
  return (
    a !== null && a !== undefined && a !== "" &&
    b !== null && b !== undefined && b !== ""
  );
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
      String(v1),
      doc2.document_type,
      String(v2),
      `${label} differs between documents.`
    );
  }
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

      if (item1.item_code && item2.item_code) {
        const code1 = normalize(String(item1.item_code));
        const code2 = normalize(String(item2.item_code));
        if (code1 && code2 && (code1.includes(code2) || code2.includes(code1))) {
          score += 10;
        }
      }

      if (item1.quantity && item2.quantity && Number(item1.quantity) === Number(item2.quantity)) {
        score += 3;
      }

      const desc1Words = normalize(item1.description || "").split(/\s+/).filter(Boolean);
      const desc2Words = new Set(normalize(item2.description || "").split(/\s+/).filter(Boolean));
      let overlap = 0;
      for (const w of desc1Words) {
        if (desc2Words.has(w)) overlap++;
      }
      if (overlap > 0) score += overlap;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = j;
      }
    }

    if (bestMatch >= 0 && bestScore >= 2) {
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

  const fieldPairs: Array<[string, string, Severity]> = [
    ["shipper", "Shipper / Seller", "critical"],
    ["shipper_address", "Shipper Address", "warning"],
    ["consignee", "Consignee / Buyer", "critical"],
    ["consignee_address", "Consignee Address", "warning"],
    ["notify_party", "Notify Party", "warning"],
    ["vessel", "Vessel Name", "critical"],
    ["voyage", "Voyage Number", "critical"],
    ["port_of_loading", "Port of Loading", "critical"],
    ["port_of_discharge", "Port of Discharge", "critical"],
    ["place_of_delivery", "Place of Delivery", "warning"],
    ["freight_terms", "Freight / Delivery Terms", "warning"],
    ["payment_terms", "Payment Terms", "info"],
  ];

  for (const [field, label, severity] of fieldPairs) {
    compareField(doc1, doc2, field, label, severity, discrepancies, matches);
  }

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

  const items1 = doc1.items || [];
  const items2 = doc2.items || [];

  if (items1.length > 0 && items2.length > 0) {
    const { matched, onlyInDoc1, onlyInDoc2 } = matchItems(items1, items2);

    for (const item of onlyInDoc1) {
      const desc = item.description || item.item_code || "Unknown item";
      const code = item.item_code ? ` (${item.item_code})` : "";
      addDiscrepancy(
        discrepancies,
        "Missing Item",
        "critical",
        doc1.document_type,
        `${desc}${code} — Qty: ${item.quantity || "?"}`,
        doc2.document_type,
        "NOT FOUND",
        `Item in ${doc1.document_type} is missing from ${doc2.document_type}.`
      );
    }

    for (const item of onlyInDoc2) {
      const desc = item.description || item.item_code || "Unknown item";
      const code = item.item_code ? ` (${item.item_code})` : "";
      addDiscrepancy(
        discrepancies,
        "Missing Item",
        "critical",
        doc1.document_type,
        "NOT FOUND",
        doc2.document_type,
        `${desc}${code} — Qty: ${item.quantity || "?"}`,
        `Item in ${doc2.document_type} is missing from ${doc1.document_type}.`
      );
    }

    for (const { item1, item2 } of matched) {
      const itemLabel = item1.item_code || item1.description || "Item";

      const q1 = Number(item1.quantity);
      const q2 = Number(item2.quantity);
      if (!isNaN(q1) && !isNaN(q2)) {
        if (q1 !== q2) {
          addDiscrepancy(
            discrepancies,
            `Quantity — ${itemLabel}`,
            "critical",
            doc1.document_type,
            `${q1} ${item1.quantity_unit || ""}`.trim(),
            doc2.document_type,
            `${q2} ${item2.quantity_unit || ""}`.trim(),
            "Quantity mismatch — must be resolved before shipment."
          );
        } else {
          matches.push(`Quantity — ${itemLabel}`);
        }
      }

      if (bothHaveValue(item1.description, item2.description)) {
        if (normalize(item1.description) !== normalize(item2.description)) {
          addDiscrepancy(
            discrepancies,
            `Description — ${itemLabel}`,
            "warning",
            doc1.document_type,
            item1.description,
            doc2.document_type,
            item2.description,
            "Description wording differs — verify if acceptable."
          );
        } else {
          matches.push(`Description — ${itemLabel}`);
        }
      }

      if (bothHaveValue(item1.gross_weight, item2.gross_weight)) {
        if (Number(item1.gross_weight) !== Number(item2.gross_weight)) {
          addDiscrepancy(
            discrepancies,
            `Gross Weight — ${itemLabel}`,
            "critical",
            doc1.document_type,
            String(item1.gross_weight),
            doc2.document_type,
            String(item2.gross_weight),
            "Weight mismatch."
          );
        } else {
          matches.push(`Gross Weight — ${itemLabel}`);
        }
      }
    }

    if (matched.length > 0 && onlyInDoc1.length === 0 && onlyInDoc2.length === 0) {
      matches.push("All items present in both documents");
    }
  }

  if (bothHaveValue(doc1.total_gross_weight, doc2.total_gross_weight)) {
    if (Number(doc1.total_gross_weight) !== Number(doc2.total_gross_weight)) {
      addDiscrepancy(
        discrepancies,
        "Total Gross Weight",
        "critical",
        doc1.document_type,
        String(doc1.total_gross_weight),
        doc2.document_type,
        String(doc2.total_gross_weight),
        "Total weight mismatch."
      );
    } else {
      matches.push("Total Gross Weight");
    }
  }

  const criticalCount = discrepancies.filter((d) => d.severity === "critical").length;
  const warningCount = discrepancies.filter((d) => d.severity === "warning").length;

  let summary: string;
  if (discrepancies.length === 0) {
    summary = "No discrepancies found. All comparable fields match between the documents.";
  } else if (criticalCount > 0) {
    summary = `Found ${criticalCount} critical issue${criticalCount > 1 ? "s" : ""} that must be resolved. ${
      warningCount > 0 ? `Also ${warningCount} warning${warningCount > 1 ? "s" : ""} to review.` : ""
    }`.trim();
  } else {
    summary = `Found ${discrepancies.length} issue${discrepancies.length > 1 ? "s" : ""} to review — no critical problems detected.`;
  }

  return { summary, discrepancies, matches };
}