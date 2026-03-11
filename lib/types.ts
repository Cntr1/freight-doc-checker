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

// Mirrors the Gensoft XML Bol_segment structure exactly.
// Used for both AI extraction output and XML parsing output.
export interface ExtractedDoc {
  document_type: string; // e.g. "House B/L", "Master B/L"
  Bol_reference: string | null; // HBL B/L number e.g. CCLBOM252402

  // Traders
  Exporter_name: string | null;
  Exporter_address: string | null;
  Consignee_name: string | null;
  Consignee_address: string | null;
  Notify_name: string | null;
  Notify_address: string | null;
  Carrier_name: string | null;
  Carrier_address: string | null;

  // Routing
  Place_of_loading_code: string | null;  // e.g. "NHAVA SHEVA" or "INNSA"
  Place_of_unloading_code: string | null; // e.g. "COLOMBO" or "LKCMB"
  Place_of_delivery: string | null;

  // Vessel
  Voyage_number: string | null;
  Vessel_name: string | null;

  // Cargo
  Number_of_packages: number | null;
  Gross_mass: number | null;
  Volume_in_cubic_meters: number | null;
  Shipping_marks: string | null;
  Goods_description: string | null;
  Ctn_reference: string | null;  // Container number
  Marks1: string | null;         // Seal number

  // Freight
  Freight_terms: string | null;  // prepaid / collect

  // Date
  Date_of_departure: string | null; // onboard date

  // Items (detailed line items when available)
  items: ExtractedItem[];

  // Allow extra keys from AI extraction
  [key: string]: any;
}

export interface ExtractedItem {
  item_code: string | null;
  po_number: string | null;
  description: string;
  quantity: number | null;
  quantity_unit: string | null;
  gross_weight: string | null;
  net_weight: string | null;
  cbm: string | null;
  cartons: string | null;
  unit_price: string | null;
  total_price: string | null;
}

// Master B/L data — maps to XML <Master_bol>
export interface MasterBolData {
  Customs_office_code: string;   // e.g. SECMB
  Voyage_number: string;
  Date_of_departure: string;     // YYYY-MM-DD
  Reference_number: string;      // MBL B/L No
}

// A single HBL slot in the UI
export interface HblSlot {
  id: string;   // unique id for React key
  file: File | null;
}
