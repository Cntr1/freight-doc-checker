export const EXTRACTION_SYSTEM_PROMPT = `You extract structured data from shipping documents. Return ONLY valid JSON.`;

export const buildExtractionPrompt = (label: string, text: string) => `Extract all data from this ${label} into structured JSON.

=== DOCUMENT TEXT ===
${text}
=== END ===

Return ONLY this JSON structure. Use null for fields not found in the document. Do not guess or infer — only extract what is explicitly stated:

{
  "document_type": "${label}",
  "shipper": "company name or null",
  "shipper_address": "full address or null",
  "consignee": "company name or null",
  "consignee_address": "full address or null",
  "notify_party": "name or null",
  "date": "date as written or null",
  "vessel": "vessel name or null",
  "voyage": "voyage number or null",
  "port_of_loading": "port or null",
  "port_of_discharge": "port or null",
  "place_of_delivery": "place or null",
  "freight_terms": "prepaid/collect/FOB/etc or null",
  "items": [
    {
      "item_code": "code/PO number or null",
      "description": "product description",
      "quantity": 0,
      "quantity_unit": "PCS/KGS/etc",
      "gross_weight": 0 or null,
      "net_weight": 0 or null,
      "cbm": 0 or null,
      "cartons": 0 or null,
      "unit_price": "price or null",
      "total_price": "price or null"
    }
  ],
  "total_gross_weight": 0 or null,
  "total_net_weight": 0 or null,
  "total_cbm": 0 or null,
  "total_cartons": 0 or null,
  "total_value": "total price or null",
  "payment_terms": "terms or null",
  "delivery_terms": "terms or null",
  "reference_numbers": ["any reference/invoice/PO numbers found"],
  "additional_notes": "any other important info or null"
}`;