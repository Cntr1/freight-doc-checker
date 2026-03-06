import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { COMPARISON_SYSTEM_PROMPT } from "@/lib/prompt";
import type { ComparisonResult } from "@/lib/types";

const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY from env

export const maxDuration = 120; // allow longer responses for big docs

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const entries = Array.from(formData.entries());

    // Build content blocks from uploaded files
    const contentParts: Anthropic.Messages.ContentBlockParam[] = [];
    const docLabels: string[] = [];

    for (const [key, value] of entries) {
      if (!(value instanceof File) || value.size === 0) continue;

      const label = formData.get(`${key}_label`) as string || key;
      docLabels.push(label);

      const buffer = Buffer.from(await value.arrayBuffer());
      const base64 = buffer.toString("base64");
      const mediaType = value.type;

      if (mediaType === "application/pdf") {
        contentParts.push({
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: base64,
          },
        } as any);
      } else {
        contentParts.push({
          type: "image",
          source: {
            type: "base64",
            media_type: mediaType as
              | "image/png"
              | "image/jpeg"
              | "image/gif"
              | "image/webp",
            data: base64,
          },
        });
      }

      contentParts.push({
        type: "text",
        text: `[The above document is: "${label}" — filename: "${value.name}"]`,
      });
    }

    if (contentParts.length < 4) {
      // Need at least 2 documents (each = 1 file block + 1 text label block)
      return NextResponse.json(
        { error: "Please upload at least 2 documents to compare." },
        { status: 400 }
      );
    }

    contentParts.push({
      type: "text",
      text: "Now compare ALL the uploaded documents against each other and flag every discrepancy. Respond ONLY with the JSON format specified in your instructions.",
    });

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: COMPARISON_SYSTEM_PROMPT,
      messages: [{ role: "user", content: contentParts }],
    });

    // Extract text from response
    const text = message.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .filter(Boolean)
      .join("\n");

    // Parse JSON (handle possible markdown wrapping)
    const clean = text.replace(/```json\s*|```\s*/g, "").trim();
    const result: ComparisonResult = JSON.parse(clean);

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Comparison API error:", err);

    if (err?.status === 401) {
      return NextResponse.json(
        { error: "Invalid API key. Check your ANTHROPIC_API_KEY in .env.local" },
        { status: 401 }
      );
    }

    if (err?.status === 429) {
      return NextResponse.json(
        { error: "Rate limited. Please wait a moment and try again." },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: err?.message || "Something went wrong during comparison." },
      { status: 500 }
    );
  }
}
