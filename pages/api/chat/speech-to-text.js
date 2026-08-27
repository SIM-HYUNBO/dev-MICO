import OpenAI from "openai";
import { Readable } from "stream";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "OPENAI_API_KEY 미설정" });

  const { audioBase64, mimeType = "audio/webm" } = req.body;
  if (!audioBase64) return res.status(400).json({ error: "오디오 데이터 없음" });

  try {
    const buffer = Buffer.from(audioBase64, "base64");
    const ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("ogg") ? "ogg" : "webm";
    const stream = Readable.from(buffer);
    stream.path = `audio.${ext}`;

    const openai = new OpenAI({ apiKey });
    const transcription = await openai.audio.transcriptions.create({
      file: stream,
      model: "whisper-1",
      language: "ko",
    });
    res.json({ text: transcription.text });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
