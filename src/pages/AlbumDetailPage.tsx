import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { InviteMemberForm } from '../components/InviteMemberForm';
import { StardewContainer } from '../components/StardewContainer';
import { JunimoLoading } from '../components/JunimoLoading';
import { ToastNotification } from '../components/ToastNotification';

import { supabase } from '../lib/supabaseClient';
import { buildOssThumbUrl, buildOssOriginalUrl } from '../utils/ossHelpers';
import { usePhotoManager } from '../hooks/usePhotoManager';
import { useToast } from '../hooks/useToast';

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

export function AlbumDetailPage() {
  const params = useParams<{ id: string }>();
  const albumId = params.id ?? '';
  const [showInvite, setShowInvite] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [album, setAlbum] = useState<AlbumDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [editingPhotoId, setEditingPhotoId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [photoToDelete, setPhotoToDelete] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc'); // 默认按时间倒序（最新在前）
  const [loadingAlbumInfo, setLoadingAlbumInfo] = useState(false); // 新增：加载相册基本信息的状态
  const { toast, showToast, clearToast } = useToast();

  // 使用自定义Hook管理照片状态
  const {
    photos,
    loadingStates,
    error: photoError,
    dispatchLoading,
    getActiveLoadingState,
    loadPhotos,
    deletePhoto,
    updatePhotoDescription,
    uploadPhotos,
  } = usePhotoManager(albumId);

  // 合并错误状态
  const combinedError = error || photoError;



  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!albumId) return;

    const abortController = new AbortController();
    
    // 设置加载状态
    setLoadingAlbumInfo(true);

    const loadAlbum = async () => {
      try {
        // 只加载相册基本信息
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError) throw userError;
        if (!user) {
          navigate('/login');
          return;
        }

        if (abortController.signal.aborted) return;

        const { data: albumData, error: albumError } = await supabase
          .from('albums')
          .select('id, name, description, created_by, cover_url')
          .eq('id', albumId)
          .single();

        if (albumError) throw albumError;

        if (!abortController.signal.aborted) {
          setAlbum(albumData as AlbumDetail);
          setIsOwner(albumData.created_by === user.id);

          // 加载照片数据
          if (!abortController.signal.aborted) {
            await loadPhotos(sortOrder);
          }
        }
      } catch (err: any) {
        if (abortController.signal.aborted) return;
        console.error('Load album detail error:', err);
        if (!abortController.signal.aborted) {
          setError(err.message ?? '加载相册详情失败');
        }
      } finally {
        // 确保在完成时清除加载状态
        if (!abortController.signal.aborted) {
          setLoadingAlbumInfo(false);
        }
      }
    };

    loadAlbum();

    return () => {
      abortController.abort();
    };
  }, [albumId, navigate, loadPhotos, sortOrder]);

  const handleTriggerUpload = () => {
    if (loadingStates.uploading) return;
    fileInputRef.current?.click();
  };

  const handleFilesSelected = async (evt: React.ChangeEvent<HTMLInputElement>) => {
    const files = evt.target.files;
    if (!files || files.length === 0 || !albumId) return;
    await uploadPhotos(Array.from(files));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDeletePhoto = async (photoId: string) => {
    setPhotoToDelete(photoId);
  };

  const confirmDeletePhoto = async (photoId: string) => {
    const result = await deletePhoto(photoId);
    
    if (result?.success) {
      showToast(result.message, 'success');
    } else {
      showToast(result?.message || '删除失败', 'error');
    }
    
    setPhotoToDelete(null);
  };

  // 重新加载照片数据（用于排序）
  const handleDeleteAlbum = async () => {
    if (!albumId) return;
    try {
      dispatchLoading({ type: 'SET_DELETING_ALBUM', payload: true });
      const { error: delError } = await supabase.from('albums').delete().eq('id', albumId);
      if (delError) throw delError;
      
      showToast('相册删除成功！', 'success');
      
      navigate('/albums');
    } catch (err: any) {
      console.error('Delete album error:', err);
      showToast(err.message ?? '删除相册失败', 'error');
      setShowDeleteConfirm(false);
    } finally {
      dispatchLoading({ type: 'SET_DELETING_ALBUM', payload: false });
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

  const handleSortChange = async (order: 'asc' | 'desc') => {
    setSortOrder(order);
    // 标记为正在排序（供全局 loading 状态使用）
    dispatchLoading({ type: 'SET_SORTING', payload: true });
    try {
      await loadPhotos(order);
      showToast(`已按${order === 'desc' ? '时间倒序' : '时间正序'}排列`, 'success');
    } finally {
      dispatchLoading({ type: 'SET_SORTING', payload: false });
    }
  };

  const saveDescription = async (photoId: string, text: string) => {
    const newText = text.trim();
    const result = await updatePhotoDescription(photoId, newText);
    
    if (result?.success) {
      showToast(result.message, 'success');
    } else {
      showToast(result?.message || '保存失败', 'error');
    }
    
    setEditingPhotoId(null);
  };


  if (!albumId) {
    return (
      <div className="page album-detail-page">
        <p className="hint">未找到相册 ID。</p>
      </div>
    );
  }

  const activeLoading = !combinedError
    ? loadingAlbumInfo
      ? { type: 'loadingAlbumInfo', message: '正在加载相册信息...' }
      : getActiveLoadingState()
    : null;
  
  return (
    <div className="page album-detail-page">
      <button type="button" className="back-btn secondary-btn" onClick={() => navigate('/albums')}>
        ← 返回相册列表
      </button>
      <StardewContainer className="album-hero">
        <div className="album-hero-header">
          <div className="album-hero-info">
            <h1 className="album-title">{album?.name ?? '相册名称'}</h1>
            {album?.description && <p className="album-subtitle">{album.description}</p>}
            {/* 排序按钮移动到相册信息下方 */}
            <div className="album-hero-sort">
              <button
                type="button"
                className="secondary-btn sort-btn"
                onClick={() => {
                  const newOrder = sortOrder === 'desc' ? 'asc' : 'desc';
                  void handleSortChange(newOrder);
                }}
                disabled={(loadingStates.loadingPhotos || loadingAlbumInfo) || !!activeLoading}
                title={`当前: ${sortOrder === 'desc' ? '时间倒序（最新在前）' : '时间正序（最早在前）'}`}
              >
                <img
                  src="/images/Field_Snack.png"
                  alt=""
                  className="sort-btn-icon"
                />
                <span>{sortOrder === 'desc' ? '时间倒序' : '时间正序'}</span>
              </button>
            </div>
          </div>
          <div
            className="album-hero-upload"
            onClick={handleTriggerUpload}
            onDragOver={(e) => {
              e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (loadingStates.uploading) return;
              const dropped = Array.from(e.dataTransfer.files || []).filter((f) =>
                f.type.startsWith('image/'),
              );
              void uploadPhotos(dropped);
            }}
          >
            <img
              src="/images/Animals_Icon.png"
              alt=""
              className="album-hero-upload-icon"
            />
            <span className="album-hero-upload-title">
              {loadingStates.uploading ? '上传中...' : (loadingStates.loadingPhotos || loadingAlbumInfo) ? '加载中...' : '上传照片'}
            </span>
            <span className="album-hero-upload-subtitle">
              {loadingStates.uploading ? '请稍候，文件正在上传至云端' : (loadingStates.loadingPhotos || loadingAlbumInfo) ? '正在加载相册信息' : '点击或拖拽图片到这里'}
            </span>
          </div>
          <div className="album-hero-actions">
            {albumId && (
              <button
                type="button"
                className="secondary-btn invite-btn"
                onClick={() => setShowInvite(true)}
                title={isOwner ? "邀请好友加入相册" : "只有相册所有者才能邀请他人"}
                disabled={!isOwner || loadingStates.loadingPhotos || loadingAlbumInfo}
              >
                <img
                  src="/images/The_Player_Icon.png"
                  alt=""
                  className="invite-btn-icon"
                />
                <span>邀请好友加入相册</span>
              </button>
            )}
            {isOwner && (
              <button 
                type="button" 
                className="secondary-btn delete-album-btn" 
                onClick={() => setShowDeleteConfirm(true)}
                disabled={loadingStates.loadingPhotos || loadingAlbumInfo}
              >
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
  
      {albumId && (
        <InviteMemberForm
          albumId={albumId}
          isOpen={showInvite}
          onClose={() => setShowInvite(false)}
          onShowMessage={(message, type = 'success') => {
            showToast(message, type);
          }}
        />
      )}
  
      {showDeleteConfirm && (
        <div
          className="dialog-backdrop"
          onClick={() => !loadingStates.deletingAlbum && setShowDeleteConfirm(false)}
        >
          <div className="dialog-card-transparent" onClick={(e) => e.stopPropagation()}>
            <StardewContainer variant="parchment">
              <div className="delete-confirm-content">
                <img
                  src="/images/Cactus_Fruit.png"
                  alt=""
                  className="delete-confirm-icon"
                />
                <h2 className="delete-confirm-title">删除相册</h2>
                <p className="delete-confirm-text">
                  确定要删除整个相册吗？相册中的所有照片记录也会被删除，此操作不可撤销。
                </p>
                <div className="delete-confirm-actions">
                  <button
                    type="button"
                    className="secondary-btn"
                    disabled={loadingStates.deletingAlbum}
                    onClick={() => setShowDeleteConfirm(false)}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="danger-btn"
                    disabled={loadingStates.deletingAlbum}
                    onClick={handleDeleteAlbum}
                  >
                    {loadingStates.deletingAlbum ? '删除中...' : '确认删除'}
                  </button>
                </div>
              </div>
            </StardewContainer>
          </div>
        </div>
      )}
  
      {toast && (
        <ToastNotification
          message={toast.message}
          type={toast.type === 'error' || toast.type === 'success' ? toast.type : 'info'}
          duration={3000}
          onClose={clearToast}
        />
      )}
  
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={handleFilesSelected}
      />

      {combinedError && (
        <StardewContainer className="photo-grid-error">
          <p className="hint">{combinedError}</p>
        </StardewContainer>
      )}

      {!loadingStates.loadingPhotos && (
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
                    disabled={!!loadingStates.deletingPhoto || loadingStates.uploading}
                  >
                    {loadingStates.deletingPhoto === photo.id ? '删除中...' : '删除'}
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
                      disabled={loadingStates.uploading}
                    >
                      {photo.description || '点击添加备注...'}
                    </button>
                  )}
                  {loadingStates.savingPhoto === photo.id && (
                    <span className="photo-remark-saving">保存中...</span>
                  )}
                </div>
              </StardewContainer>
            </div>
          ))}
        </div>
      )}

      {!loadingStates.loadingPhotos && photos.length === 0 && !combinedError && (
        <StardewContainer className="photo-grid-placeholder">
          <div className="photo-grid-placeholder-content">
            <img
              src="/images/Chest.png"
              alt=""
              className="photo-grid-placeholder-icon"
            />
            <p className="photo-grid-placeholder-title">照片墙</p>
            <p className="photo-grid-placeholder-text">
              这里将以瀑布流的形式展示相册中的所有照片，上传成功后会自动出现在这里。
            </p>
          </div>
        </StardewContainer>
      )}

      {activeLoading && (
        <JunimoLoading text={activeLoading.message} />
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

      {photoToDelete && (
        <div className="dialog-backdrop" onClick={() => setPhotoToDelete(null)}>
          <div className="dialog-card" onClick={(e) => e.stopPropagation()}>
            <h2>确认删除照片</h2>
            <p>确定要删除这张照片吗？云端文件与数据库记录都将被删除。</p>
            <div className="dialog-actions">
              <button
                type="button"
                className="secondary-btn"
                onClick={() => setPhotoToDelete(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="danger-btn"
                onClick={() => confirmDeletePhoto(photoToDelete)}
                disabled={!!loadingStates.deletingPhoto}
              >
                {loadingStates.deletingPhoto ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}