const OSS_BASE_URL = (import.meta as any).env?.VITE_OSS_BASE_URL ?? '';

/**
 * 从 photo 的 oss_path（或完整 URL）解析出 OSS 的 objectName（bucket 内对象键），供 delete 使用。
 */
export function getOssObjectName(ossPath: string | null | undefined): string | null {
  if (!ossPath || !ossPath.trim()) return null;
  const trimmed = ossPath.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const pathname = new URL(trimmed).pathname;
      return pathname.replace(/^\//, '') || null;
    } catch {
      return null;
    }
  }
  return trimmed.replace(/^\//, '');
}

/**
 * 构建 OSS 图片 URL，支持缩略图处理
 * @param ossPath OSS 路径或完整 URL
 * @param options 可选配置
 * @param options.width 缩略图宽度，默认 400
 * @param options.fallback 当路径无效时的回退图片，默认 '/images/Horse_rider.png'
 */
export function buildOssImageUrl(
  ossPath: string | null | undefined,
  options: { width?: number; fallback?: string } = {}
): string {
  const { width = 400, fallback = '/images/Horse_rider.png' } = options;

  // 容错：如果路径为空，返回占位图
  if (!ossPath) {
    return fallback;
  }

  // 如果已经是完整 URL
  if (/^https?:\/\//i.test(ossPath)) {
    // 添加缩略图参数（避免重复）
    if (ossPath.includes('x-oss-process=')) return ossPath;
    const hasQuery = ossPath.includes('?');
    return `${ossPath}${hasQuery ? '&' : '?'}x-oss-process=image/resize,w_${width}`;
  }

  // 相对路径需要拼接基础域名
  if (!OSS_BASE_URL) {
    return fallback;
  }

  const base = OSS_BASE_URL.replace(/\/$/, '');
  const path = ossPath.replace(/^\//, '');
  return `${base}/${path}?x-oss-process=image/resize,w_${width}`;
}

/**
 * 构建 OSS 原图 URL（不带缩略图处理）
 */
export function buildOssOriginalUrl(ossPath: string | null | undefined): string {
  if (!ossPath) return '';
  
  if (/^https?:\/\//i.test(ossPath)) {
    return ossPath;
  }

  if (!OSS_BASE_URL) return '';
  
  const base = OSS_BASE_URL.replace(/\/$/, '');
  const path = ossPath.replace(/^\//, '');
  return `${base}/${path}`;
}

// 向后兼容：保留原有函数名
export const buildOssAlbumCoverUrl = (ossPath: string | null | undefined) => 
  buildOssImageUrl(ossPath, { width: 400 });

export const buildOssThumbUrl = (ossPath: string | null | undefined) => 
  buildOssImageUrl(ossPath, { width: 400 });

