export type Severity = "critical" | "warning" | "info";

export interface Discrepancy {
  field: string;
  severity: Severity;
  doc1_label: string;
  doc1_value: string;
  doc2_label: string;
  doc2_value: string;
  note: string;
}

export interface ComparisonResult {
  summary: string;
  discrepancies: Discrepancy[];
  matches: string[];
}

export interface DocumentSlot {
  key: string;
  label: string;
  icon: string;
  description: string;
}

export const DOCUMENT_TYPES: DocumentSlot[] = [
  {
    key: "bl_instruction",
    label: "B/L Instruction",
    icon: "📋",
    description: "Shipper's instructions for B/L preparation",
  },
  {
    key: "packing_list",
    label: "Packing List",
    icon: "📦",
    description: "Detailed breakdown of cargo contents",
  },
  {
    key: "bill_of_lading",
    label: "Bill of Lading",
    icon: "🚢",
    description: "The issued or draft B/L to verify",
  },
  {
    key: "commercial_invoice",
    label: "Commercial Invoice",
    icon: "🧾",
    description: "Seller's invoice for the shipment",
  },
];
