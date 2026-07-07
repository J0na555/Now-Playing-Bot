import type { VercelRequest, VercelResponse } from "@vercel/node";
import { parseNowPlayingSvg } from "../lib/svg-parser";
import { editMessageMedia } from "../lib/telegram";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers["authorization"];
    if (authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  const {
    SPOTIFY_UID,
    TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID,
    TELEGRAM_MESSAGE_ID,
  } = process.env;

  if (!SPOTIFY_UID || !TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID || !TELEGRAM_MESSAGE_ID) {
    return res.status(500).json({ error: "Missing required environment variables" });
  }

  try {
    const svgUrl = `https://spotify-github-profile.kittinanx.com/api/view?uid=${SPOTIFY_UID}&theme=spotify-embed`;
    const svgResponse = await fetch(svgUrl);

    if (!svgResponse.ok) {
      throw new Error(`kittinanx.com returned ${svgResponse.status}`);
    }

    const svgText = await svgResponse.text();
    const nowPlaying = parseNowPlayingSvg(svgText);

    const caption = [
      `🎵 *${nowPlaying.song}*`,
      `👤 ${nowPlaying.artist}`,
      `🎧 ${nowPlaying.statusText}`,
    ].join("\n\n");

    await editMessageMedia({
      botToken: TELEGRAM_BOT_TOKEN,
      chatId: TELEGRAM_CHAT_ID,
      messageId: Number(TELEGRAM_MESSAGE_ID),
      imageBuffer: nowPlaying.imageBuffer,
      imageMimeType: nowPlaying.imageMimeType,
      caption,
    });

    return res.status(200).json({
      ok: true,
      song: nowPlaying.song,
      artist: nowPlaying.artist,
    });
  } catch (err) {
    console.error("poll.ts failed:", err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}
