import type { ExtractedDoc, MasterBolData } from "./types";

function getText(el: Element, tag: string): string {
  return el.getElementsByTagName(tag)[0]?.textContent?.trim() ?? "";
}

function getNum(el: Element, tag: string): number | null {
  const t = getText(el, tag);
  const n = parseFloat(t);
  return isNaN(n) ? null : n;
}

/**
 * Parse a Gensoft Awbolds XML string.
 * Returns the Master_bol data and one ExtractedDoc per Bol_segment.
 */
export function parseGensoftXml(xmlString: string): {
  master: MasterBolData;
  hbls: ExtractedDoc[];
} {
  // DOMParser is available in Next.js server environment via the undici/web globals
  // but to be safe we use a simple regex-free approach with a lightweight XML parse
  // Next.js 15 edge/node has DOMParser via the `@xmldom/xmldom` polyfill we can import,
  // or we can use the native one in a browser context.
  // Since this runs server-side, we'll use a manual element extraction approach
  // that avoids any DOM dependency.

  const doc = parseXml(xmlString);

  // Master
  const masterEl = findTag(doc, "Master_bol");
  const master: MasterBolData = {
    Customs_office_code: masterEl ? getTextFromNode(masterEl, "Customs_office_code") : "",
    Voyage_number:       masterEl ? getTextFromNode(masterEl, "Voyage_number") : "",
    Date_of_departure:   masterEl ? getTextFromNode(masterEl, "Date_of_departure") : "",
    Reference_number:    masterEl ? getTextFromNode(masterEl, "Reference_number") : "",
  };

  // HBL segments
  const segmentEls = findAllTags(doc, "Bol_segment");
  const hbls: ExtractedDoc[] = segmentEls.map((seg, idx) => {
    const bolId       = findTagInNode(seg, "Bol_id");
    const loadUnload  = findTagInNode(seg, "Load_unload_place");
    const traders     = findTagInNode(seg, "Traders_segment");
    const carrier     = traders ? findTagInNode(traders, "Carrier") : null;
    const exporter    = traders ? findTagInNode(traders, "Exporter") : null;
    const notify      = traders ? findTagInNode(traders, "Notify") : null;
    const consignee   = traders ? findTagInNode(traders, "Consignee") : null;
    const ctn         = findTagInNode(seg, "ctn_segment");
    const goods       = findTagInNode(seg, "Goods_segment");

    const bolRef = bolId ? getTextFromNode(bolId, "Bol_reference") : "";

    return {
      document_type: `House B/L (XML)`,
      Bol_reference: bolRef || null,

      Exporter_name:    exporter    ? getTextFromNode(exporter,  "Exporter_name")    : null,
      Exporter_address: exporter    ? getTextFromNode(exporter,  "Exporter_address") : null,
      Consignee_name:   consignee   ? getTextFromNode(consignee, "Consignee_name")   : null,
      Consignee_address:consignee   ? getTextFromNode(consignee, "Consignee_address"): null,
      Notify_name:      notify      ? getTextFromNode(notify,    "Notify_name")      : null,
      Notify_address:   notify      ? getTextFromNode(notify,    "Notify_address")   : null,
      Carrier_name:     carrier     ? getTextFromNode(carrier,   "Carrier_name")     : null,
      Carrier_address:  carrier     ? getTextFromNode(carrier,   "Carrier_address")  : null,

      Place_of_loading_code:   loadUnload ? getTextFromNode(loadUnload, "Place_of_loading_code")   : null,
      Place_of_unloading_code: loadUnload ? getTextFromNode(loadUnload, "Place_of_unloading_code") : null,
      Place_of_delivery: null,

      Voyage_number:  master.Voyage_number  || null,
      Vessel_name:    null, // not stored in XML

      Number_of_packages: goods ? getNumFromNode(goods, "Number_of_packages") : null,
      Gross_mass:         goods ? getNumFromNode(goods, "Gross_mass")         : null,
      Volume_in_cubic_meters: goods ? getNumFromNode(goods, "Volume_in_cubic_meters") : null,
      Shipping_marks:     goods ? getTextFromNode(goods, "Shipping_marks")    || null : null,
      Goods_description:  goods ? getTextFromNode(goods, "Goods_description") || null : null,

      Ctn_reference: ctn ? getTextFromNode(ctn, "Ctn_reference") || null : null,
      Marks1:        ctn ? getTextFromNode(ctn, "Marks1")        || null : null,

      Freight_terms: null,
      Date_of_departure: master.Date_of_departure || null,

      items: [],
    } satisfies ExtractedDoc;
  });

  return { master, hbls };
}

// ─── Minimal XML node tree ──────────────────────────────────────────────────

interface XNode {
  tag: string;
  text: string;
  children: XNode[];
}

function parseXml(xml: string): XNode {
  // Strip XML declaration and normalize line endings
  const s = xml.replace(/<\?xml[^>]*\?>/g, "").replace(/\r\n/g, "\n").trim();
  let pos = 0;

  function parseNode(): XNode | null {
    // Skip whitespace and comments
    while (pos < s.length) {
      if (s.startsWith("<!--", pos)) {
        const end = s.indexOf("-->", pos);
        pos = end >= 0 ? end + 3 : s.length;
        continue;
      }
      if (s[pos] === "<") break;
      pos++;
    }
    if (pos >= s.length || s[pos] !== "<") return null;

    // Opening tag
    const tagStart = pos + 1;
    const tagEnd = s.indexOf(">", tagStart);
    if (tagEnd < 0) return null;

    const rawTag = s.substring(tagStart, tagEnd).trim();
    if (rawTag.startsWith("/")) return null; // closing tag

    // Self-closing?
    const selfClose = rawTag.endsWith("/");
    const tagName = selfClose
      ? rawTag.slice(0, -1).trim().split(/\s+/)[0]
      : rawTag.split(/\s+/)[0];

    pos = tagEnd + 1;

    if (selfClose) return { tag: tagName, text: "", children: [] };

    const children: XNode[] = [];
    let textContent = "";

    while (pos < s.length) {
      // Check for closing tag
      if (s.startsWith(`</${tagName}>`, pos)) {
        pos += `</${tagName}>`.length;
        break;
      }
      if (s[pos] === "<") {
        const child = parseNode();
        if (child) children.push(child);
      } else {
        // Accumulate text
        const nextTag = s.indexOf("<", pos);
        const chunk = nextTag >= 0 ? s.substring(pos, nextTag) : s.substring(pos);
        textContent += chunk;
        pos = nextTag >= 0 ? nextTag : s.length;
      }
    }

    return { tag: tagName, text: textContent.trim(), children };
  }

  const root = parseNode();
  return root ?? { tag: "root", text: "", children: [] };
}

function findTag(node: XNode, tag: string): XNode | null {
  if (node.tag === tag) return node;
  for (const child of node.children) {
    const found = findTag(child, tag);
    if (found) return found;
  }
  return null;
}

function findAllTags(node: XNode, tag: string): XNode[] {
  const results: XNode[] = [];
  if (node.tag === tag) results.push(node);
  for (const child of node.children) {
    results.push(...findAllTags(child, tag));
  }
  return results;
}

function findTagInNode(node: XNode, tag: string): XNode | null {
  for (const child of node.children) {
    if (child.tag === tag) return child;
    const found = findTagInNode(child, tag);
    if (found) return found;
  }
  return null;
}

function getTextFromNode(node: XNode, tag: string): string {
  const found = findTagInNode(node, tag);
  return found?.text ?? "";
}

function getNumFromNode(node: XNode, tag: string): number | null {
  const t = getTextFromNode(node, tag);
  const n = parseFloat(t);
  return isNaN(n) ? null : n;
}
