export function escapeHtml(s: string): string {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function isSpotifyActive(
	statusText: string | null | undefined,
	lastProgress: string | null | undefined,
	currentProgress: string | null | undefined
): boolean {
	const status = (statusText ?? "").trim().toUpperCase();
	if (status !== "NOW PLAYING") return false;
	if (lastProgress == null) return true;
	return currentProgress !== lastProgress;
}

export interface SpotifyCaptionInput {
	song: string;
	artist: string;
	statusText: string;
	spotifyUid: string; // trusted env value, NOT escaped
}

export function spotifyCaption({
	song,
	artist,
	statusText,
	spotifyUid,
}: SpotifyCaptionInput): string {
	return [
		`▶️ <b>${escapeHtml(song)}</b> — ${escapeHtml(artist)}`,
		`Now playing on <a href="https://open.spotify.com/user/${spotifyUid}">Spotify</a>`,
		`└── ${escapeHtml(statusText)} ───`,
	].join("\n");
}

export interface YoutubeCaptionInput {
	videoId: string; // validated by the push gate, trusted — NOT escaped
	title: string;
	channel: string;
}

export function youtubeCaption({ videoId, title, channel }: YoutubeCaptionInput): string {
	return [
		`▶️ <a href="https://youtu.be/${videoId}">${escapeHtml(title)}</a>`,
		escapeHtml(channel),
		`└── Watching on YouTube ───`,
	].join("\n");
}
