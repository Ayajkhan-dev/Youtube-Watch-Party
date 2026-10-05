// YouTube URL/ID parser: client (URL input) aur server (change_video validation) dono yahi use karte hain.
// Valid input par 11-char videoId, warna null.
const ID_REGEX = /^[A-Za-z0-9_-]{11}$/;

export function isValidVideoId(id: string): boolean {
  return ID_REGEX.test(id);
}

export function parseYouTubeId(input: string): string | null {
  const text = (input ?? '').trim();
  if (!text) return null;
  if (ID_REGEX.test(text)) return text; // seedha 11-char ID

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www\.|m\.|music\.)/, '');
  const parts = url.pathname.split('/').filter(Boolean);

  let candidate: string | undefined;
  if (host === 'youtu.be') {
    candidate = parts[0];
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (parts[0] === 'watch') candidate = url.searchParams.get('v') ?? undefined;
    else if (['shorts', 'embed', 'live', 'v'].includes(parts[0] ?? '')) candidate = parts[1];
  }
  return candidate && ID_REGEX.test(candidate) ? candidate : null;
}
