# Freight Doc Checker

AI-powered shipping document verification for freight forwarders. Upload packing lists, bills of lading, invoices, and B/L instructions — the app cross-references every field and flags discrepancies automatically.

Powered by Google Gemini (free tier).

## How it works

The app uses a two-stage approach:

1. **AI extracts** structured data from each document (items, quantities, parties, weights, dates, etc.)
2. **Code compares** the extracted data field by field — no AI guesswork in the comparison logic

This means the comparison rules are deterministic and reliable. The AI only handles document reading, which it's good at.

**Supports both text-based and scanned PDFs** — text PDFs use fast extraction, scanned/image PDFs automatically fall back to Gemini's vision.

## What it catches

- **Missing items** — an item on the packing list that's not on the invoice (critical)
- **Quantity mismatches** — different piece counts for the same item (critical)
- **Weight discrepancies** — any gross/net weight difference, no matter how small (critical)
- **Party name mismatches** — wrong shipper, consignee, or notify party (critical)
- **Port/vessel errors** — wrong loading port, discharge port, or vessel name (critical)
- **Description differences** — wording variations between documents (warning)
- **Address formatting** — minor formatting or abbreviation differences (info)
- **B/L-style documents** — handles bills of lading that describe goods as a single block instead of individual line items

## Setup

### 1. Get a free Gemini API key

Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey) and create a key — no credit card required.

### 2. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/freight-doc-checker.git
cd freight-doc-checker
npm install
```

### 3. Configure

```bash
cp .env.local.example .env.local
```

Edit `.env.local` and paste your key:

```
GEMINI_API_KEY=AIza...
```

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Usage

1. Upload at least 2 shipping documents (PDF — both text-based and scanned work)
2. Click **Compare Documents**
3. Review findings — color-coded by severity (critical / warning / info)
4. Verified fields are listed at the bottom

## Supported documents

| Document | Description |
|----------|-------------|
| Packing List | Detailed breakdown of cargo contents, weights, measurements |
| Bill of Lading | Master or house B/L — issued or draft |
| Commercial Invoice | Seller's invoice with item prices and totals |
| B/L Instruction | Shipper's instructions for B/L preparation |

## Severity levels

| Level | Meaning | Examples |
|-------|---------|----------|
| Critical | Must be resolved before shipment | Missing items, quantity mismatch, weight difference, wrong consignee |
| Warning | Should be reviewed | Description wording differences, address variations |
| Info | Worth noting, usually acceptable | Date format differences, abbreviations, zip code formatting |

## Project structure

```
freight-doc-checker/
├── app/
│   ├── api/compare/route.ts   ← API route (extraction + orchestration)
│   ├── globals.css             ← Tailwind v4 + design tokens
│   ├── layout.tsx
│   └── page.tsx                ← Main UI
├── components/
│   ├── upload-zone.tsx         ← Drag-and-drop file upload
│   └── results-panel.tsx       ← Discrepancy display
├── lib/
│   ├── types.ts                ← Shared types and document slot definitions
│   ├── prompt.ts               ← AI extraction prompt (easy to tune)
│   └── compare.ts              ← Comparison logic (pure code, no AI)
├── .env.local.example
├── package.json
└── README.md
```

## Customizing

- **Add document types** — edit `lib/types.ts` to add new upload slots
- **Tune extraction** — edit `lib/prompt.ts` to adjust what data gets pulled from documents
- **Change comparison rules** — edit `lib/compare.ts` to adjust severity thresholds, add new field comparisons, or change matching logic
- **Switch models** — edit `app/api/compare/route.ts` to change from `gemini-2.5-flash` to another model

## Tech stack

- Next.js 15 with App Router
- Google Gemini 2.5 Flash / Flash Lite (free tier)
- pdf-parse for text extraction
- Tailwind CSS v4
- Framer Motion
- TypeScript

## License

MIT
