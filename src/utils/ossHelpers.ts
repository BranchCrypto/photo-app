const OSS_BASE_URL = (import.meta as any).env?.VITE_OSS_BASE_URL ?? '';

export function buildOssAlbumCoverUrl(ossPath: string | null | undefined) {
  if (!ossPath) return '/images/Horse_rider.png';
  if (/^https?:\/\//i.test(ossPath)) return ossPath;
  if (!OSS_BASE_URL) return '/images/Horse_rider.png';
  const base = OSS_BASE_URL.replace(/\/$/, '');
  const path = ossPath.replace(/^\//, '');
  return `${base}/${path}?x-oss-process=image/resize,w_400`;
}

