// Receives YouTube watch state from the Chrome extension (extension/content.js)
// and stores it in Upstash. /api/poll reads it back and picks a card.
//
// CORS is locked to youtube.com origins: the extension runs on YouTube pages,
// so a browser-initiated POST only ever carries one of the allowlisted origins.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { setYouTubeState } from "../lib/redis";

const ALLOWED_ORIGINS = ["https://www.youtube.com", "https://m.youtube.com"];

function allowlistedOrigin(req: VercelRequest): string | null {
  const origin = req.headers["origin"];
  if (typeof origin !== "string" || !ALLOWED_ORIGINS.includes(origin)) return null;
  return origin;
}

function applyCorsHeaders(req: VercelRequest, res: VercelResponse): void {
  const origin = allowlistedOrigin(req);
  if (!origin) return;
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
}

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS preflight — deliberately auth-free.
  if (req.method === "OPTIONS") {
    const origin = allowlistedOrigin(req);
    if (!origin) {
      return res.status(403).end();
    }
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Browser can read error responses (401/400/...) as long as the origin is allowed.
  applyCorsHeaders(req, res);

  const pushSecret = process.env.PUSH_SECRET;
  if (!pushSecret) {
    return res.status(503).json({ error: "not configured" });
  }

  const authHeader = req.headers["authorization"];
  if (authHeader !== `Bearer ${pushSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const contentType = req.headers["content-type"] ?? "";
  if (!contentType.includes("application/json")) {
    return res.status(415).json({ error: "Content-Type must be application/json" });
  }

  let payload: unknown;
  try {
    payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(415).json({ error: "Request body must be valid JSON" });
  }

  if (payload === null || typeof payload !== "object") {
    return res.status(400).json({ error: "Body must be a JSON object" });
  }

  const body = payload as Record<string, unknown>;
  const { videoId, title, channel, paused } = body;

  if (typeof videoId !== "string" || !VIDEO_ID_RE.test(videoId)) {
    return res
      .status(400)
      .json({ error: "videoId is required and must be 11 chars of [A-Za-z0-9_-]" });
  }
  if (typeof title !== "string" || title.length === 0 || title.length > 200) {
    return res
      .status(400)
      .json({ error: "title is required and must be a string of at most 200 chars" });
  }
  if (typeof channel !== "string" || channel.length === 0 || channel.length > 200) {
    return res
      .status(400)
      .json({ error: "channel is required and must be a string of at most 200 chars" });
  }
  if (typeof paused !== "boolean") {
    return res.status(400).json({ error: "paused is required and must be a boolean" });
  }

  try {
    await setYouTubeState({ videoId, title, channel, paused, receivedAt: Date.now() });
  } catch (err) {
    console.error("push.ts: failed to write YouTube state:", err);
    return res.status(500).json({ error: "Failed to write state" });
  }

  return res.status(200).json({ ok: true });
}