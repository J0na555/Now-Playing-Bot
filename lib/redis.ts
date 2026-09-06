// Thin access layer over Upstash Redis. The client reads
// UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN from the environment.

import { Redis } from "@upstash/redis";

export const YT_STATE_KEY = "np:yt:state";
export const SPOTIFY_PROGRESS_KEY = "np:spotify:progress";

// Build the client only when the env vars exist. An eager Redis.fromEnv() would
// throw at module load and kill /api/poll entirely — the poll must keep running
// in Spotify-only mode without Upstash configured.
function createClient(): Redis | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }
  return Redis.fromEnv();
}

// Construction is deferred to first use and wrapped in try/catch. The env-var
// guard above does not catch a malformed-but-present UPSTASH_REDIS_REST_URL —
// Redis.fromEnv() throws (e.g. UrlError for a non-https URL) and an eager call
// at module scope would 500 every route at import time. Any construction
// failure degrades to the same "unavailable" result as missing env vars.
let redisClient: Redis | null | undefined;

function getRedis(): Redis | null {
  if (redisClient !== undefined) return redisClient;
  try {
    redisClient = createClient();
  } catch (err) {
    console.warn("redis.ts: Upstash client unavailable, continuing without Redis:", err);
    redisClient = null;
  }
  return redisClient;
}

export interface YouTubeState {
  videoId: string;
  title: string;
  channel: string;
  paused: boolean;
  receivedAt: number;
}

export async function getYouTubeState(): Promise<YouTubeState | null> {
  const client = getRedis();
  if (!client) return null;
  return client.get<YouTubeState>(YT_STATE_KEY);
}

export async function setYouTubeState(state: YouTubeState): Promise<void> {
  const client = getRedis();
  if (!client) {
    throw new Error(
      "Upstash Redis is not configured (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN missing)"
    );
  }
  await client.set(YT_STATE_KEY, state, { ex: 3600 });
}

export async function getSpotifyProgress(): Promise<string | null> {
  const client = getRedis();
  if (!client) return null;
  return client.get<string>(SPOTIFY_PROGRESS_KEY);
}

export async function setSpotifyProgress(value: string): Promise<void> {
  const client = getRedis();
  if (!client) {
    throw new Error(
      "Upstash Redis is not configured (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN missing)"
    );
  }
  await client.set(SPOTIFY_PROGRESS_KEY, value, { ex: 600 });
}
