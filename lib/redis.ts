import { Redis } from "@upstash/redis";

export const YT_STATE_KEY = "np:yt:state";
export const SPOTIFY_PROGRESS_KEY = "np:spotify:progress";

function createClient(): Redis | null {
	if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
		return null;
	}
	return Redis.fromEnv();
}

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
