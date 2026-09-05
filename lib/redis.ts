// Thin access layer over Upstash Redis. The client reads
// UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN from the environment.

import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

export const YT_STATE_KEY = "np:yt:state";
export const SPOTIFY_PROGRESS_KEY = "np:spotify:progress";

export interface YouTubeState {
  videoId: string;
  title: string;
  channel: string;
  paused: boolean;
  receivedAt: number;
}

export async function getYouTubeState(): Promise<YouTubeState | null> {
  return redis.get<YouTubeState>(YT_STATE_KEY);
}

export async function setYouTubeState(state: YouTubeState): Promise<void> {
  await redis.set(YT_STATE_KEY, state, { ex: 3600 });
}

export async function getSpotifyProgress(): Promise<string | null> {
  return redis.get<string>(SPOTIFY_PROGRESS_KEY);
}

export async function setSpotifyProgress(value: string): Promise<void> {
  await redis.set(SPOTIFY_PROGRESS_KEY, value, { ex: 600 });
}