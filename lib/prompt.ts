export const EXTRACTION_SYSTEM_PROMPT = `You extract structured data from shipping documents. Return ONLY valid JSON.`;

export const buildExtractionPrompt = (label: string, text: string) =>
  `Extract all data from this ${label} into structured JSON.

=== DOCUMENT TEXT ===
${text}
=== END ===

Return ONLY this JSON. Use null for fields not in the document. Keep values exactly as written in the document. The "document_type" MUST be exactly "${label}" — do not change it:

{
  "document_type": "${label}",
  "shipper": "company name only or null",
  "shipper_address": "address only or null",
  "consignee": "company name only or null",
  "consignee_address": "address only or null",
  "notify_party": "name or null",
  "date": "date as written or null",
  "vessel": "vessel name or null",
  "voyage": "voyage number or null",
  "port_of_loading": "port or null",
  "port_of_discharge": "port or null",
  "place_of_delivery": "place or null",
  "freight_terms": "prepaid/collect/FOB/etc or null",
  "payment_terms": "terms or null",
  "delivery_terms": "terms or null",
  "items": [
    {
      "item_code": "product number like 71414 or null",
      "po_number": "PO reference or null",
      "description": "product description as written",
      "quantity": 10000,
      "quantity_unit": "PCS",
      "gross_weight": "weight or null",
      "net_weight": "weight or null",
      "cbm": "measurement or null",
      "cartons": "count or null",
      "unit_price": "price or null",
      "total_price": "price or null"
    }
  ],
  "total_gross_weight": null,
  "total_net_weight": null,
  "total_cbm": null,
  "total_cartons": null,
  "total_value": null,
  "reference_numbers": []
}

IMPORTANT RULES:
- Each distinct product/line item should be a separate entry in "items". If a document lists 3 different products, there should be 3 items.
- Use "item_code" for the specific product number (like 71414, 71415, 71416) and "po_number" for the PO/order reference.
- SHIPPER/SELLER identification:
  * On a Packing List: the shipper is the company whose letterhead or logo appears on the document, NOT the "Ship To" party. The "Ship To" party is the CONSIGNEE/BUYER.
  * On an Invoice: the company issuing the invoice (at the top/letterhead) is the SHIPPER/SELLER. The "TO:" or "Bill To:" party is the CONSIGNEE/BUYER.
  * On a Bill of Lading: the "Shipper" field explicitly labels who the shipper is. The "Consignee" field labels the consignee.
  * The shipper is typically the exporter/manufacturer/seller. The consignee is the importer/buyer/receiver.
- If goods are listed as a single block (e.g. "METAL HOOK / SPRING / STAINLESS STEEL SHEET") without individual quantities, create ONE item entry with the full description and set quantity to null.
- Do NOT split a combined goods description into separate items unless each has its own quantity.`;