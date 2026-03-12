export const EXTRACTION_SYSTEM_PROMPT = `You extract structured data from shipping documents. Return ONLY valid JSON.`;

export const buildExtractionPrompt = (label: string, text: string) =>
  `Extract all data from this ${label} into structured JSON.

=== DOCUMENT TEXT ===
${text}
=== END ===

Return ONLY this JSON. Use null for fields not present. Keep values exactly as written. The "document_type" MUST be exactly "${label}":

{
  "document_type": "${label}",
  "Bol_reference": "the B/L number on this document. On a House B/L this is the forwarder's reference e.g. CCLBOM252402. On a Master B/L this is the carrier's B/L number e.g. BOMA54245600 — it may also appear as the Booking No. Extract it regardless of which field it appears in. Use null if not found.",

  "Exporter_name": "the shipper/consignor/exporter company name, or null",
  "Exporter_address": "the shipper/consignor/exporter address, or null",
  "Consignee_name": "the consignee/buyer company name, or null",
  "Consignee_address": "the consignee/buyer address, or null",
  "Notify_name": "notify party name, or null",
  "Notify_address": "notify party address, or null",
  "Carrier_name": "delivery agent / carrier company name, or null",
  "Carrier_address": "delivery agent / carrier address, or null",

  "Place_of_loading_code": "port of loading as written on document, or null",
  "Place_of_unloading_code": "port of discharge as written on document, or null",
  "Place_of_delivery": "place of delivery as written, or null",

  "Voyage_number": "voyage number only (e.g. 0011W), NOT including vessel name, or null",
  "Vessel_name": "vessel name only (e.g. ONE READINESS), NOT including voyage number, or null",

  "Number_of_packages": 21,
  "Gross_mass": 6380.72,
  "Volume_in_cubic_meters": 50.0,
  "Shipping_marks": "the Marks and Numbers / Shipping Marks field as written (e.g. TIRUPATI MAKE). Look in the marks/numbers column of the cargo table. Use null if genuinely absent.",
  "Goods_description": "the COMPLETE goods description block exactly as written — include ALL lines in order: the package count line (e.g. 'NINETEEN PACKAGE ONLY TOTAL 19 PACKAGES'), part codes, product descriptions, invoice numbers, HS codes, S/Bill numbers. Do NOT include weight table data (lines containing GR. WT., NET. WT., KGS with numbers, or CBM values). Do NOT truncate or skip any lines.",
  "Ctn_reference": "the container number — a code like HMMU4028768 (4 letters + 7 digits). Do NOT use the carrier B/L prefix (like HDMU or BOMA). If the document shows 'HMMU4028768 / 2464981' the container number is HMMU4028768. Use null if not found.",
  "Marks1": "the seal number — on an MBL it appears after the slash in the container line e.g. 'HMMU4028768 / 2464981' where 2464981 is the seal number. Also check the Seal No. field. Use null if not found.",

  "Freight_terms": "PREPAID or COLLECT or null",
  "Date_of_departure": "onboard date in YYYY-MM-DD format, or null",

  "items": [
    {
      "item_code": "product code like 71400 or null",
      "po_number": "PO reference or null",
      "description": "product description as written",
      "hs_code": "HS/HTS tariff code for this line item e.g. 39202010, or null",
      "quantity": 1000,
      "quantity_unit": "PCS",
      "gross_weight": "weight or null",
      "net_weight": "weight or null",
      "cbm": "measurement or null",
      "cartons": "count or null",
      "unit_price": "price or null",
      "total_price": "price or null"
    }
  ]
}

IMPORTANT RULES:
- Bol_reference: this is the House B/L number issued by the freight forwarder (e.g. CCLBOM252402). Not the MBL/carrier B/L number.
- Vessel_name and Voyage_number: ALWAYS extract these as separate fields. If the document shows "ONE READINESS V 0011W", Vessel_name = "ONE READINESS" and Voyage_number = "0011W".
- Exporter/Shipper identification:
  * On a B/L: "Consignor" or "Shipper" field = Exporter_name/address. "Consignee" field = Consignee_name/address.
  * On a Packing List: the company on the letterhead/logo is the Exporter, NOT the "Ship To" party. "Ship To" = Consignee.
  * On an Invoice: the issuing company (top/letterhead) is the Exporter. "To:" / "Bill To:" = Consignee.
- Number_of_packages: extract as a plain number (e.g. 21, not "21 PACKAGES").
- Gross_mass: extract as a plain number in KGS (e.g. 6380.72, not "6380.72 KGS").
- Volume_in_cubic_meters: extract as a plain number (e.g. 50.0), or 0 if not stated.
- If goods are listed as a single block without individual quantities, create ONE item with the full description and quantity = null.
- Do NOT split a combined goods description into separate items unless each has its own quantity.
- hs_code: extract the HS/HTS tariff code for each line item if present (e.g. 39202010, 39262099). On invoices and packing lists it usually appears in a dedicated column. On B/Ls it may appear in the goods description block.`;
