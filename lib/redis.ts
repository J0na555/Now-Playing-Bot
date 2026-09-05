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

const redis = createClient();

export interface YouTubeState {
  videoId: string;
  title: string;
  channel: string;
  paused: boolean;
  receivedAt: number;
}

export async function getYouTubeState(): Promise<YouTubeState | null> {
  if (!redis) return null;
  return redis.get<YouTubeState>(YT_STATE_KEY);
}

export async function setYouTubeState(state: YouTubeState): Promise<void> {
  if (!redis) {
    throw new Error(
      "Upstash Redis is not configured (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN missing)"
    );
  }
  await redis.set(YT_STATE_KEY, state, { ex: 3600 });
}

export async function getSpotifyProgress(): Promise<string | null> {
  if (!redis) return null;
  return redis.get<string>(SPOTIFY_PROGRESS_KEY);
}

export async function setSpotifyProgress(value: string): Promise<void> {
  if (!redis) {
    throw new Error(
      "Upstash Redis is not configured (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN missing)"
    );
  }
  await redis.set(SPOTIFY_PROGRESS_KEY, value, { ex: 600 });
}