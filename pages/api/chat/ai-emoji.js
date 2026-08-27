"use strict";

import * as database from "@/pages/api/biz/database/database";
import * as dynamicSql from "@/pages/api/biz/dynamicSql";
import * as constants from "@/lib/constants";
import { deploymentSystemCode } from "@/lib/tenantResolver";


function getBearerToken(req) {
  const auth = req.headers.authorization || "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
}

async function verifySession(userId, sessionToken, SYSTEM_CODE) {
  if (!userId || !sessionToken) return false;
  try {
    const sql = await dynamicSql.getSQL(SYSTEM_CODE, "select_TB_COR_USER_SESSION", 1);
    const result = await database.executeSQL(sql, [SYSTEM_CODE, sessionToken, userId]);
    return result.rowCount > 0;
  } catch {
    return false;
  }
}

const SVG_SYSTEM_PROMPT = `You are an animated SVG emoji sticker designer.
Generate a cute, expressive, colorful animated emoji sticker as SVG and suggest a short Korean name.
Rules:
- viewBox="0 0 200 200", no width/height attributes on <svg>
- White or light background circle/rounded rect behind the icon
- Vibrant colors, simple bold shapes, no text inside SVG
- Include visible looping animation using SVG <animate>, <animateTransform>, or inline CSS @keyframes
- The animation must be obvious in a chat bubble: bounce, blink, wave, nod, sparkle, shake, or sip motion
- Use 1-3 subtle repeating animations with dur between 0.6s and 2s, repeatCount="indefinite" when using SVG animation
- Return ONLY a JSON object (no markdown) with two fields:
  { "svg": "<svg ...>...</svg>", "name": "short_name" }
- "name" must be Korean or emoji, max 10 characters, no spaces`;

export default async function handler(req, res) {
  // ?뚮꼳?몃뒗 ?쒕쾭媛 ?붿껌?쇰줈遺???뺥븳??
  const SYSTEM_CODE = deploymentSystemCode();
  if (req.method !== "POST") return res.status(405).end();

  const { userId, prompt } = req.body || {};
  if (!await verifySession(userId, getBearerToken(req), SYSTEM_CODE)) return res.status(401).json({ error: "AUTH_REQUIRED" });
  if (!prompt || typeof prompt !== "string") return res.status(400).json({ error: "prompt required" });

  const trimmed = prompt.trim().slice(0, 200);
  if (!trimmed) return res.status(400).json({ error: "prompt required" });

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return res.status(503).json({ error: "OPENAI_API_KEY is not set" });

  try {
    const chatRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SVG_SYSTEM_PROMPT },
          { role: "user", content: `Draw an animated cute emoji sticker with a clear looping motion: ${trimmed}` },
        ],
        max_tokens: 1500,
        temperature: 0.9,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!chatRes.ok) {
      const errJson = await chatRes.json().catch(() => ({}));
      return res.status(502).json({ error: `OpenAI error (${chatRes.status}): ${errJson?.error?.message || ""}` });
    }

    const chatData = await chatRes.json();
    const raw = chatData.choices?.[0]?.message?.content?.trim() || "";

    let svg = "", suggestedName = "";
    try {
      const jsonStr = raw.replace(/^```[a-z]*\n?/i, "").replace(/```$/, "").trim();
      const parsed = JSON.parse(jsonStr);
      svg = parsed.svg || "";
      suggestedName = (parsed.name || "").slice(0, 10);
    } catch {
      // If JSON parsing fails, try to extract the SVG tag.
    }

    if (!svg) {
      const svgStart = raw.indexOf("<svg");
      const svgEnd = raw.lastIndexOf("</svg>") + 6;
      if (svgStart === -1 || svgEnd < 6) return res.status(502).json({ error: "SVG generation failed" });
      svg = raw.slice(svgStart, svgEnd);
    }

    const b64 = Buffer.from(svg).toString("base64");
    return res.status(200).json({ dataUrl: `data:image/svg+xml;base64,${b64}`, suggestedName });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "AI emoji generation failed" });
  }
}
