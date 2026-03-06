# Freight Doc Checker

AI-powered shipping document verification for freight forwarders. Upload B/L instructions, packing lists, bills of lading, and commercial invoices — the AI cross-references every field and flags discrepancies.

![Next.js](https://img.shields.io/badge/Next.js-15-black)
![Claude](https://img.shields.io/badge/Claude-Sonnet-orange)

## What it does

- **Compares** B/L instructions, packing lists, bills of lading, and commercial invoices side by side
- **Flags** discrepancies with severity levels: critical, warning, info
- **Checks** shipper/consignee details, container numbers, weights, package counts, ports, freight terms, and more
- **Confirms** which fields match correctly across documents

## Setup

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/freight-doc-checker.git
cd freight-doc-checker
npm install
```

### 2. Add your API key

```bash
cp .env.local.example .env.local
```

Edit `.env.local` and add your Anthropic API key from [console.anthropic.com](https://console.anthropic.com/):

```
ANTHROPIC_API_KEY=sk-ant-...
```

### 3. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Usage

1. Upload at least 2 shipping documents (PDF or images)
2. Click **Compare Documents**
3. Review the AI's findings — discrepancies are color-coded by severity

## Supported document types

| Document | Description |
|----------|-------------|
| B/L Instruction | Shipper's instructions for B/L preparation |
| Packing List | Detailed breakdown of cargo contents |
| Bill of Lading | The issued or draft B/L to verify |
| Commercial Invoice | Seller's invoice for the shipment |

## Tech stack

- **Next.js 15** — React framework with API routes
- **Claude Sonnet** — AI-powered document analysis via Anthropic API
- **Tailwind CSS v4** — Styling
- **Framer Motion** — Animations
- **TypeScript** — Type safety

## Customizing

- **Add document types**: Edit `lib/types.ts` to add more document slots
- **Tune the AI prompt**: Edit `lib/prompt.ts` to adjust what fields get checked and how severity is classified
- **Change the model**: Edit `app/api/compare/route.ts` to use a different Claude model

## License

MIT
