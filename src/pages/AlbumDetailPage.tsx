import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { InviteMemberForm } from '../components/InviteMemberForm';
import { StardewContainer } from '../components/StardewContainer';
import { JunimoLoading } from '../components/JunimoLoading';
import { supabase } from '../lib/supabaseClient';

type AlbumDetail = {
  id: string;
  name: string;
  description: string | null;
  created_by: string | null;
  cover_url?: string | null;
};

type PhotoRow = {
  id: string;
  album_id: string;
  oss_path: string;
  user_id: string | null;
  file_name?: string | null;
  description?: string | null;
  created_at?: string | null;
};

// 从环境变量中读取 OSS 基础域名，例如：https://your-bucket.oss-cn-hangzhou.aliyuncs.com
const OSS_BASE_URL = (import.meta as any).env?.VITE_OSS_BASE_URL ?? '';

function buildOssThumbUrl(ossPath: string | null | undefined) {
  // 容错：如果路径为空，返回占位图
  if (!ossPath) {
    return '/images/Horse_rider.png';
  }

  const processQuery = 'x-oss-process=image/resize,w_400';

  // 1. 先构造完整的原图 URL
  let fullUrl = ossPath;

  // 如果 oss_path 不是以 http 开头，说明是相对路径，需要拼上 Bucket 域名
  if (!/^https?:\/\//i.test(ossPath)) {
    if (!OSS_BASE_URL) {
      // 如果没有配置基础域名，为避免出现 undefined 前缀，使用占位图
      return '/images/Horse_rider.png';
    }
    const base = OSS_BASE_URL.replace(/\/$/, '');
    const path = ossPath.replace(/^\//, '');
    fullUrl = `${base}/${path}`;
  }

  // 2. 再拼接缩略图参数（避免重复添加）
  if (fullUrl.includes('x-oss-process=')) return fullUrl;
  const hasQuery = fullUrl.includes('?');
  return `${fullUrl}${hasQuery ? '&' : '?'}${processQuery}`;
}

function buildOssOriginalUrl(ossPath: string | null | undefined) {
  if (!ossPath) return '';
  let fullUrl = ossPath;
  if (!/^https?:\/\//i.test(ossPath)) {
    if (!OSS_BASE_URL) return '';
    const base = OSS_BASE_URL.replace(/\/$/, '');
    const path = ossPath.replace(/^\//, '');
    fullUrl = `${base}/${path}`;
  }
  return fullUrl;
}

export function AlbumDetailPage() {
  const params = useParams<{ id: string }>();
  const albumId = params.id ?? '';
  const [showInvite, setShowInvite] = useState(false);
  const [album, setAlbum] = useState<AlbumDetail | null>(null);
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [editingPhotoId, setEditingPhotoId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [savingPhotoId, setSavingPhotoId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!albumId) return;

    const loadAlbum = async () => {
      try {
        setLoading(true);
        setError(null);

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError) throw userError;
        if (!user) {
          navigate('/login');
          return;
        }

        const { data: albumData, error: albumError } = await supabase
          .from('albums')
          .select('id, name, description, created_by, cover_url')
          .eq('id', albumId)
          .single();

        if (albumError) throw albumError;

        const { data: photosData, error: photosError } = await supabase
          .from('photos')
          .select('id, album_id, oss_path, user_id, file_name, description, created_at')
          .eq('album_id', albumId)
          .order('id', { ascending: false });

        if (photosError) throw photosError;

        setAlbum(albumData as AlbumDetail);
        setPhotos((photosData ?? []) as PhotoRow[]);
        setIsOwner(albumData.created_by === user.id);
      } catch (err: any) {
        console.error('Load album detail error:', err);
        setError(err.message ?? '加载相册详情失败');
      } finally {
        setLoading(false);
      }
    };

    void loadAlbum();
  }, [albumId, navigate]);

  const handleTriggerUpload = () => {
    if (uploading) return;
    fileInputRef.current?.click();
  };

  const handleFilesSelected = async (evt: React.ChangeEvent<HTMLInputElement>) => {
    const files = evt.target.files;
    if (!files || files.length === 0 || !albumId) return;
    await handleUploadFiles(Array.from(files));
  };

  const handleUploadFiles = async (files: File[]) => {
    if (!albumId || files.length === 0) return;

    try {
      setUploading(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;

      if (!user) {
        setError('请先登录');
        return;
      }

      const uploadedPhotoRows: PhotoRow[] = [];

      for (const file of files) {
        // 调用 Edge Function 获取 OSS 上传签名（统一指向 dynamic-endpoint，无需鉴权）
        const { data: signData, error: signError } = await supabase.functions.invoke(
          'dynamic-endpoint',
          {
            body: {
              albumId,
              filename: file.name,
              contentType: file.type,
            },
          },
        );

        if (signError) {
          console.error('Get OSS signature error:', signError);
          window.alert('获取上传权限失败');
          return;
        }

        // 这里假设 Edge Function 返回 OSS 表单直传所需的字段
        const {
          host,
          dir,
          policy,
          signature,
          accessKeyId,
        }: {
          host: string;
          dir: string;
          policy: string;
          signature: string;
          accessKeyId: string;
        } = signData as any;

        const objectKey = `${dir}${file.name}`;

        const formData = new FormData();
        formData.append('key', objectKey);
        formData.append('OSSAccessKeyId', accessKeyId);
        formData.append('policy', policy);
        formData.append('Signature', signature);
        formData.append('success_action_status', '200');
        formData.append('Content-Type', file.type);
        formData.append('file', file);

        const ossResp = await fetch(host, {
          method: 'POST',
          body: formData,
        });

        // 阿里云直传通常返回 204（或 200/201）；这里只要是 2xx 就认为成功
        if (!ossResp.ok || (ossResp.status < 200 || ossResp.status >= 300)) {
          throw new Error('上传到 OSS 失败');
        }

        // 上传成功后，记录到 photos 表
        const { data: photoRow, error: photoError } = await supabase
          .from('photos')
          .insert({
            album_id: albumId,
            oss_path: objectKey,
            user_id: user.id,
            file_name: file.name,
            description: null,
          })
          .select()
          .single();

        if (photoError) throw photoError;

        uploadedPhotoRows.push(photoRow as PhotoRow);

        // 始终将最新上传的图片设为相册封面
        const { error: coverError } = await supabase
          .from('albums')
          .update({ cover_url: objectKey })
          .eq('id', albumId);

        if (!coverError) {
          setAlbum((prev) => (prev ? { ...prev, cover_url: objectKey } : prev));
        }
      }

      // 上传与插入成功后，重新加载当前相册的照片列表，保证数据与后端完全一致
      if (uploadedPhotoRows.length > 0) {
        const { data: refreshedPhotos, error: refreshedError } = await supabase
          .from('photos')
          .select('id, album_id, oss_path, user_id, file_name, description, created_at')
          .eq('album_id', albumId)
          .order('id', { ascending: false });

        if (refreshedError) {
          console.error('Refresh photos after upload error:', refreshedError);
        } else if (refreshedPhotos) {
          setPhotos(refreshedPhotos as PhotoRow[]);
        }
      }
    } catch (err: any) {
      console.error('Upload photos error:', err);
      setError(err.message ?? '上传照片失败');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeletePhoto = async (photoId: string) => {
    if (!window.confirm('确定要删除这张照片吗？')) return;
    try {
      const { error: deleteError } = await supabase.from('photos').delete().eq('id', photoId);
      if (deleteError) throw deleteError;
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
    } catch (err: any) {
      console.error('Delete photo error:', err);
      setError(err.message ?? '删除照片失败');
    }
  };

  const handleDeleteAlbum = async () => {
    if (!albumId) return;
    if (!window.confirm('确定要删除整个相册吗？相册中的所有照片记录也会被删除。')) return;
    try {
      const { error: delError } = await supabase.from('albums').delete().eq('id', albumId);
      if (delError) throw delError;
      navigate('/albums');
    } catch (err: any) {
      console.error('Delete album error:', err);
      setError(err.message ?? '删除相册失败');
    }
  };

  const formatDate = (iso?: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    const day = `${d.getDate()}`.padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const startEditDescription = (photo: PhotoRow) => {
    setEditingPhotoId(photo.id);
    setEditingText(photo.description ?? '');
  };

  const saveDescription = async (photoId: string, text: string) => {
    const newText = text.trim();
    setSavingPhotoId(photoId);
    try {
      const { error: updateError } = await supabase
        .from('photos')
        .update({ description: newText || null })
        .eq('id', photoId);
      if (updateError) throw updateError;
      setPhotos((prev) =>
        prev.map((p) => (p.id === photoId ? { ...p, description: newText || null } : p)),
      );
    } catch (err: any) {
      console.error('Update description error:', err);
      window.alert('保存备注失败，请稍后重试');
    } finally {
      setSavingPhotoId(null);
      setEditingPhotoId(null);
    }
  };

  if (!albumId) {
    return (
      <div className="page album-detail-page">
        <p className="hint">未找到相册 ID。</p>
      </div>
    );
  }

  return (
    <div className="page album-detail-page">
      <StardewContainer className="album-hero">
        <div className="album-hero-header">
          <div className="album-hero-info">
            <h1 className="album-title">{album?.name ?? '相册名称'}</h1>
            {album?.description && <p className="album-subtitle">{album.description}</p>}
          </div>
          <div
            className="album-hero-upload"
            onClick={handleTriggerUpload}
            onDragOver={(e) => {
              e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (uploading) return;
              const dropped = Array.from(e.dataTransfer.files || []).filter((f) =>
                f.type.startsWith('image/'),
              );
              void handleUploadFiles(dropped);
            }}
          >
            <img
              src="/images/Animals_Icon.png"
              alt=""
              className="album-hero-upload-icon"
            />
            <span className="album-hero-upload-title">上传照片</span>
            <span className="album-hero-upload-subtitle">点击或拖拽图片到这里</span>
          </div>
          <div className="album-hero-actions">
            {albumId && (
              <button
                type="button"
                className="secondary-btn invite-btn"
                onClick={() => setShowInvite((v) => !v)}
              >
                <img
                  src="/images/The_Player_Icon.png"
                  alt=""
                  className="invite-btn-icon"
                />
                <span>{showInvite ? '收起邀请面板' : '邀请好友加入相册'}</span>
              </button>
            )}
            {isOwner && (
              <button type="button" className="secondary-btn delete-album-btn" onClick={handleDeleteAlbum}>
                <img
                  src="/images/Cactus_Fruit.png"
                  alt=""
                  className="delete-album-icon"
                />
                <span>删除相册</span>
              </button>
            )}
          </div>
        </div>
      </StardewContainer>

      {albumId && showInvite && <InviteMemberForm albumId={albumId} />}

      {error && <p className="hint">错误：{error}</p>}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={handleFilesSelected}
      />

      <div className="photo-grid">
        {photos.map((photo) => (
          <div key={photo.id} className="photo-card">
            <StardewContainer className="photo-card-inner">
              <div className="photo-image-wrap">
                <button
                  type="button"
                  className="photo-image-button"
                  onClick={() => {
                    const original = buildOssOriginalUrl(photo.oss_path);
                    if (original) {
                      setPreviewUrl(original);
                    }
                  }}
                >
                  <img
                    src={buildOssThumbUrl(photo.oss_path)}
                    alt="相册照片"
                    className="photo-image"
                  />
                </button>
                <button
                  type="button"
                  className="photo-delete-btn"
                  onClick={() => handleDeletePhoto(photo.id)}
                >
                  删除
                </button>
              </div>

              <div className="photo-remark">
                {photo.created_at && (
                  <div className="photo-date">
                    <img
                      src="/images/Time_Icon.png"
                      alt=""
                      className="photo-date-icon"
                    />
                    <span>{formatDate(photo.created_at)}</span>
                  </div>
                )}
                {editingPhotoId === photo.id ? (
                  <textarea
                    className="photo-remark-edit"
                    value={editingText}
                    autoFocus
                    rows={2}
                    placeholder="写点什么吧..."
                    onChange={(e) => setEditingText(e.target.value)}
                    onBlur={() => saveDescription(photo.id, editingText)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        (e.currentTarget as HTMLTextAreaElement).blur();
                      }
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className={
                      photo.description ? 'photo-remark-text' : 'photo-remark-text photo-remark-empty'
                    }
                    onClick={() => startEditDescription(photo)}
                  >
                    {photo.description || '点击添加备注...'}
                  </button>
                )}
                {savingPhotoId === photo.id && (
                  <span className="photo-remark-saving">保存中...</span>
                )}
              </div>
            </StardewContainer>
          </div>
        ))}
      </div>

      {!loading && photos.length === 0 && !error && (
        <div className="photo-grid-placeholder-card">
          <p className="photo-grid-placeholder-title">照片墙</p>
          <p className="photo-grid-placeholder-text">
            这里将以瀑布流的形式展示相册中的所有照片，上传成功后会自动出现在这里。
          </p>
        </div>
      )}

      {(loading || uploading) && (
        <JunimoLoading text={loading ? '正在加载相册内容...' : '正在上传照片...'} />
      )}

      {previewUrl && (
        <div
          className="photo-viewer-backdrop"
          onClick={() => {
            setPreviewUrl(null);
          }}
        >
          <div
            className="photo-viewer-content"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <button
              type="button"
              className="photo-viewer-close"
              onClick={() => setPreviewUrl(null)}
            >
              关闭
            </button>
            <div className="photo-viewer-image-wrap">
              <img src={previewUrl} alt="高清大图" className="photo-viewer-image" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

