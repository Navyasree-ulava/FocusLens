const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com']);

export function isYouTubeHost(host: string | null | undefined): boolean {
  return host !== undefined && host !== null && YOUTUBE_HOSTS.has(host.toLocaleLowerCase());
}
