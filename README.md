# Freight Doc Checker

AI-powered shipping document verification for freight forwarders. Upload B/L instructions, packing lists, bills of lading, and commercial invoices — the AI cross-references every field and flags discrepancies.

**Free to use** — powered by Google Gemini's free API tier.

## What it does

- **Compares** B/L instructions, packing lists, bills of lading, and commercial invoices
- **Flags** discrepancies with severity levels: critical, warning, info
- **Checks** shipper/consignee details, container numbers, weights, package counts, ports, freight terms, and more
- **Confirms** which fields match correctly across documents

## Setup

### 1. Get a free Gemini API key

Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey) and create a key. It's free — the free tier gives you 15 requests/minute and 1,500 requests/day.

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

Edit `.env.local` and paste your Gemini API key:

```
GEMINI_API_KEY=AIza...
```

### 4. Run

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

## Customizing

- **Add document types**: Edit `lib/types.ts`
- **Tune the AI prompt**: Edit `lib/prompt.ts` to adjust what gets checked and severity rules
- **Change the model**: Edit `app/api/compare/route.ts` (default: `gemini-2.0-flash`)

## Tech stack

- Next.js 15
- Google Gemini 2.0 Flash (free tier)
- Tailwind CSS v4
- Framer Motion
- TypeScript

## License

MIT
