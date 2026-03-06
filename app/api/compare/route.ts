import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { COMPARISON_SYSTEM_PROMPT } from "@/lib/prompt";
import type { ComparisonResult } from "@/lib/types";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey === "your_api_key_here") {
    return NextResponse.json(
      { error: "GEMINI_API_KEY not configured. Get a free key at https://aistudio.google.com/apikey" },
      { status: 401 }
    );
  }

  try {
    const formData = await request.formData();
    const entries = Array.from(formData.entries());

    // Build parts array for Gemini
    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
    let docCount = 0;

    for (const [key, value] of entries) {
      if (!(value instanceof File) || value.size === 0) continue;

      const label = (formData.get(`${key}_label`) as string) || key;

      const buffer = Buffer.from(await value.arrayBuffer());
      const base64 = buffer.toString("base64");

      parts.push({
        inlineData: {
          mimeType: value.type,
          data: base64,
        },
      });

      parts.push({
        text: `[The above document is: "${label}" — filename: "${value.name}"]`,
      });

      docCount++;
    }

    if (docCount < 2) {
      return NextResponse.json(
        { error: "Please upload at least 2 documents to compare." },
        { status: 400 }
      );
    }

    parts.push({
      text: "Now compare ALL the uploaded documents against each other and flag every discrepancy. Respond ONLY with the JSON format specified in your instructions.",
    });

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      systemInstruction: COMPARISON_SYSTEM_PROMPT,
    });

    const result = await model.generateContent({
      contents: [{ role: "user", parts }],
      generationConfig: {
        maxOutputTokens: 4096,
        temperature: 0.1, // low temp for precise factual comparison
      },
    });

    const response = result.response;
    const text = response.text();

    // Parse JSON (strip any markdown wrapping Gemini might add)
    const clean = text.replace(/```json\s*|```\s*/g, "").trim();

    let parsed: ComparisonResult;
    try {
      parsed = JSON.parse(clean);
    } catch {
      // If JSON parsing fails, try to extract JSON from the response
      const jsonMatch = clean.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("AI returned an unexpected format. Please try again.");
      }
    }

    return NextResponse.json(parsed);
  } catch (err: any) {
    console.error("Comparison API error:", err);

    if (err?.message?.includes("API_KEY_INVALID") || err?.status === 400) {
      return NextResponse.json(
        { error: "Invalid Gemini API key. Get a free one at https://aistudio.google.com/apikey" },
        { status: 401 }
      );
    }

    if (err?.status === 429) {
      return NextResponse.json(
        { error: "Rate limited. The free tier allows 15 requests/minute — wait a moment and retry." },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: err?.message || "Something went wrong during comparison." },
      { status: 500 }
    );
  }
}
