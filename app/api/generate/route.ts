import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { DICTIONARY, diffByOne } from "@/lib/dictionary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PROMPT = `Generate a fresh, fun word ladder puzzle.

Rules:
- Start word and target word must each be exactly 4 letters
- Both must be common English words
- Provide a complete solution path from start to target
- Each step changes EXACTLY ONE letter from the previous word
- Every word in the path must be a real, common English word
- Path length: 4 to 6 words total (3-5 transformations)
- Pick a thematic, evocative pair (e.g., COLD→WARM, DARK→DAWN, FOOD→COOK, RICH→POOR, FIRE→COAL)
- Avoid the same start/target as previous responses

Respond ONLY with a JSON object, no markdown, no commentary:
{"start":"XXXX","target":"XXXX","path":["XXXX","XXXX","XXXX","XXXX"],"theme":"Short label"}`;

type GenResult = {
  start: string;
  target: string;
  par: number;
  theme: string;
  solution: string[];
};

function parseAndValidate(text: string): GenResult {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(cleaned);
  const start = String(parsed.start).toUpperCase();
  const target = String(parsed.target).toUpperCase();
  const path: string[] = parsed.path.map((w: string) => String(w).toUpperCase());

  if (start.length !== 4 || target.length !== 4) throw new Error("words not 4 letters");
  if (path[0] !== start || path[path.length - 1] !== target) throw new Error("path bounds wrong");
  if (path.length < 2 || path.length > 7) throw new Error("path length out of range");
  for (let i = 1; i < path.length; i++) {
    if (path[i].length !== 4) throw new Error("path word not 4 letters");
    if (!diffByOne(path[i - 1], path[i])) throw new Error(`step ${i} not single-letter change`);
  }
  // augment dictionary so the generated words validate during play
  for (const w of path) DICTIONARY.add(w.toLowerCase());

  return {
    start,
    target,
    par: path.length - 1,
    theme: parsed.theme || "Custom",
    solution: path,
  };
}

export async function GET() {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  // Try up to 3 times — Claude occasionally fumbles a single-letter step
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const msg = await client.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 400,
        messages: [{ role: "user", content: PROMPT }],
      });
      const text = msg.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map(b => b.text)
        .join("");
      const result = parseAndValidate(text);
      return NextResponse.json(result);
    } catch (err) {
      lastErr = err;
    }
  }
  return NextResponse.json(
    { error: "Could not generate a valid puzzle", detail: String(lastErr) },
    { status: 502 }
  );
}
