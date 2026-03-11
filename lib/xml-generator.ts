import type { ExtractedDoc, MasterBolData } from "./types";

/** Infer Gensoft package type code from goods description / package count.
 *  PX = pallets, PK = packages/cartons (default)
 */
function inferPackageTypeCode(hbl: ExtractedDoc): string {
  const desc = (hbl.Goods_description || "").toUpperCase();
  if (desc.includes("PALLET")) return "PX";
  return "PK";
}

/**
 * Generates a Gensoft-compatible Awbolds XML string from extracted HBL data.
 * Fields that can't be read from the PDF (Carrier_code, Package_type_code, etc.)
 * are emitted as empty strings so you can fill them in Gensoft or manually.
 */
export function generateGensoftXml(
  master: Partial<MasterBolData>,
  hbls: ExtractedDoc[]
): string {
  const lines: string[] = [];

  lines.push(`<?xml version="1.0" encoding="UTF-8" standalone="no"?>`);
  lines.push(`<Awbolds>`);
  lines.push(`\t<Master_bol>`);
  lines.push(`\t\t<Customs_office_code>${x(master.Customs_office_code)}</Customs_office_code>`);
  lines.push(`\t\t<Voyage_number>${x(master.Voyage_number)}</Voyage_number>`);
  lines.push(`\t\t<Date_of_departure>${x(master.Date_of_departure)}</Date_of_departure>`);
  lines.push(`\t\t<Reference_number>${x(master.Reference_number)}</Reference_number>`);
  lines.push(`\t</Master_bol>`);

  hbls.forEach((hbl, idx) => {
    lines.push(`\t<Bol_segment>`);

    // Bol_id
    lines.push(`\t\t<Bol_id>`);
    lines.push(`\t\t\t<Bol_reference>${x(hbl.Bol_reference)}</Bol_reference>`);
    lines.push(`\t\t\t<Line_number>${idx + 1}</Line_number>`);
    lines.push(`\t\t\t<Bol_nature>23</Bol_nature>`);
    lines.push(`\t\t\t<Bol_type_code>HSB</Bol_type_code>`);
    lines.push(`\t\t</Bol_id>`);

    lines.push(`\t\t<Consolidated_Cargo>1</Consolidated_Cargo>`);

    // Load/Unload — try to resolve port names to LOCODE if recognisable
    const pol = resolvePortCode(hbl.Place_of_loading_code);
    const pod = resolvePortCode(hbl.Place_of_unloading_code);
    lines.push(`\t\t<Load_unload_place>`);
    lines.push(`\t\t\t<Place_of_loading_code>${x(pol)}</Place_of_loading_code>`);
    lines.push(`\t\t\t<Place_of_unloading_code>${x(pod)}</Place_of_unloading_code>`);
    lines.push(`\t\t</Load_unload_place>`);

    // Traders
    lines.push(`\t\t<Traders_segment>`);

    lines.push(`\t\t\t<Carrier>`);
    lines.push(`\t\t\t\t<Carrier_code>${x(hbl.Carrier_code)}</Carrier_code>`);
    lines.push(`\t\t\t\t<Carrier_name>${x(hbl.Carrier_name)}</Carrier_name>`);
    lines.push(`\t\t        <Carrier_address>${x(hbl.Carrier_address)}</Carrier_address>`);
    lines.push(`\t        </Carrier>`);

    lines.push(`\t\t\t<Exporter>`);
    lines.push(`\t\t\t\t<Exporter_name>${x(hbl.Exporter_name)}</Exporter_name>`);
    lines.push(`\t\t\t\t<Exporter_address>${x(hbl.Exporter_address)}</Exporter_address>`);
    lines.push(`\t\t\t</Exporter>`);

    lines.push(`\t\t\t<Notify>`);
    lines.push(`\t\t\t\t<Notify_name>${x(hbl.Notify_name)}</Notify_name>`);
    lines.push(`\t\t\t\t<Notify_address>${x(hbl.Notify_address)}</Notify_address>`);
    lines.push(`\t\t\t</Notify>`);

    lines.push(`\t\t\t<Consignee>`);
    lines.push(`\t\t\t\t<Consignee_name>${x(hbl.Consignee_name)}</Consignee_name>`);
    lines.push(`\t\t\t\t<Consignee_address>${x(hbl.Consignee_address)}</Consignee_address>`);
    lines.push(`\t\t\t</Consignee>`);

    lines.push(`\t\t</Traders_segment>`);

    // Container
    lines.push(`\t\t<ctn_segment>`);
    lines.push(`\t\t\t<Ctn_reference>${x(hbl.Ctn_reference)}</Ctn_reference>`);
    lines.push(`\t\t\t<Number_of_packages>${hbl.Number_of_packages ?? ""}</Number_of_packages>`);
    lines.push(`\t\t\t<Type_of_container>${x(hbl.Type_of_container)}</Type_of_container>`);
    lines.push(`\t\t\t<Empty_Full>02</Empty_Full>`);
    lines.push(`\t\t\t<Marks1>${x(hbl.Marks1)}</Marks1>`);
    lines.push(`\t\t</ctn_segment>`);

    // Goods
    lines.push(`\t\t<Goods_segment>`);
    lines.push(`\t\t\t<Number_of_packages>${hbl.Number_of_packages ?? ""}</Number_of_packages>`);
    lines.push(`\t\t\t<Package_type_code>${inferPackageTypeCode(hbl)}</Package_type_code>`);
    lines.push(`\t\t\t<Gross_mass>${hbl.Gross_mass ?? ""}</Gross_mass>`);
    lines.push(`\t\t\t<Shipping_marks>${x(hbl.Shipping_marks)}</Shipping_marks>`);
    lines.push(`\t\t\t<Goods_description>${x(hbl.Goods_description)}</Goods_description>`);
    lines.push(`\t\t\t<Volume_in_cubic_meters>${hbl.Volume_in_cubic_meters ?? 0}</Volume_in_cubic_meters>`);
    lines.push(`\t\t\t<Num_of_ctn_for_this_bol>1</Num_of_ctn_for_this_bol>`);
    lines.push(`\t\t\t<Information/>`);
    lines.push(`\t\t</Goods_segment>`);

    // Value (always zero / empty — not on HBL)
    lines.push(`\t\t<Value_segment>`);
    lines.push(`\t\t\t<Freight_segment>`);
    lines.push(`\t\t\t\t<Freight_value>0</Freight_value>`);
    lines.push(`\t\t\t\t<Freight_currency>ZZZ</Freight_currency>`);
    lines.push(`\t\t\t</Freight_segment>`);
    lines.push(`\t\t\t<Customs_segment>`);
    lines.push(`\t\t\t\t<Customs_value>0</Customs_value>`);
    lines.push(`\t\t\t\t<Customs_currency>ZZZ</Customs_currency>`);
    lines.push(`\t\t\t</Customs_segment>`);
    lines.push(`\t\t\t<Insurance_segment>`);
    lines.push(`\t\t\t\t<Insurance_value>0</Insurance_value>`);
    lines.push(`\t\t\t\t<Insurance_currency>ZZZ</Insurance_currency>`);
    lines.push(`\t\t\t</Insurance_segment>`);
    lines.push(`\t\t\t<Transport_segment/>`);
    lines.push(`\t\t</Value_segment>`);

    lines.push(`\t\t<Location/>`);
    lines.push(`\t</Bol_segment>`);
  });

  lines.push(`</Awbolds>`);
  return lines.join("\r\n");
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Sanitise for Gensoft XML. Replaces & with AND, strips all other
 *  special characters. Only letters, digits, space, . , / - are kept.
 */
function x(val: string | null | undefined): string {
  if (!val) return "";
  return val
    .replace(/&/g, " AND ")
    .replace(/[^a-zA-Z0-9 .,\/\-]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Resolve common port names to UN/LOCODE for the XML port code fields */
const PORT_NAME_TO_CODE: Record<string, string> = {
  nhavasheva:  "INNSA",
  nhabasheva:  "INNSA",
  "nhava sheva": "INNSA",
  mumbai:      "INBOM",
  colombo:     "LKCMB",
  singapore:   "SGSIN",
  ningbo:      "CNNGB",
  shanghai:    "CNSHA",
  shenzhen:    "CNSZU",
  hongkong:    "HKHKG",
  "hong kong": "HKHKG",
  portklang:   "MYTPP",
  "port klang": "MYTPP",
  dubai:       "AEJEA",
  losangeles:  "USLAX",
  newyork:     "USNYC",
};

function resolvePortCode(val: string | null | undefined): string {
  if (!val) return "";
  // Already looks like a LOCODE
  if (/^[A-Z]{5}$/.test(val.trim())) return val.trim();
  // Try to match by normalised name
  const norm = val.toLowerCase().replace(/,.*$/, "").trim();
  return PORT_NAME_TO_CODE[norm] || PORT_NAME_TO_CODE[norm.replace(/\s+/g, "")] || val;
}
