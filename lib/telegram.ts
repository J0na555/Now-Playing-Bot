// Thin wrapper around Telegram's editMessageMedia, since our photo comes in as raw
// bytes (decoded from base64) rather than a hosted URL, this has to be a multipart
// upload rather than a simple JSON call with a media URL.

export interface EditMessageMediaParams {
  botToken: string;
  chatId: string;
  messageId: number;
  imageBuffer: Buffer;
  imageMimeType: string;
  caption: string;
}

export async function editMessageMedia({
  botToken,
  chatId,
  messageId,
  imageBuffer,
  imageMimeType,
  caption,
}: EditMessageMediaParams): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken}/editMessageMedia`;

  const extension = imageMimeType.split("/")[1] ?? "jpg";
  const filename = `cover.${extension}`;

  const media = {
    type: "photo",
    media: `attach://${filename}`,
    caption,
    parse_mode: "Markdown",
  };

  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("message_id", String(messageId));
  form.append("media", JSON.stringify(media));

  // Node 18+ has global Blob/FormData — no extra deps needed.
  const blob = new Blob([imageBuffer], { type: imageMimeType });
  form.append(filename, blob, filename);

  const response = await fetch(url, {
    method: "POST",
    body: form,
  });

  const result = await response.json();

  if (!result.ok) {
    // Telegram returns ok:false with a description on failure (e.g. "message not
    // modified" if the same track/caption is sent twice in a row — safe to ignore
    // that specific case, but log everything else).
    const description: string = result.description ?? "";
    if (description.includes("message is not modified")) {
      return; // nothing changed since last poll — not an error
    }
    throw new Error(`Telegram editMessageMedia failed: ${description}`);
  }
}
