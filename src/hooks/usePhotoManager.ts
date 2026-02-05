import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getOssObjectName } from '../utils/ossHelpers';

interface PhotoRow {
  id: string;
  album_id: string;
  oss_path: string;
  user_id: string | null;
  file_name?: string | null;
  description?: string | null;
  created_at?: string | null;
}

interface LoadingStates {
  uploading: boolean;
  deletingAlbum: boolean;
  deletingPhoto: string | null;
  savingPhoto: string | null;
  sorting: boolean;
  loadingPhotos: boolean;
}

type LoadingAction = 
  | { type: 'SET_UPLOADING'; payload: boolean }
  | { type: 'SET_DELETING_ALBUM'; payload: boolean }
  | { type: 'SET_DELETING_PHOTO'; payload: string | null }
  | { type: 'SET_SAVING_PHOTO'; payload: string | null }
  | { type: 'SET_SORTING'; payload: boolean }
  | { type: 'SET_LOADING_PHOTOS'; payload: boolean };

export const usePhotoManager = (albumId: string) => {
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [loadingStates, setLoadingStates] = useState<LoadingStates>({
    uploading: false,
    deletingAlbum: false,
    deletingPhoto: null,
    savingPhoto: null,
    sorting: false,
    loadingPhotos: false,
  });
  const [error, setError] = useState<string | null>(null);

  // 使用 ref 跟踪组件是否已挂载，防止组件卸载后的状态更新
  // 注意：在 React.StrictMode 下，会有一次“假卸载+重新挂载”，所以需要在 effect 里显式置为 true
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // 初始加载照片
  // 统一的状态管理函数
  const dispatchLoading = useCallback((action: LoadingAction) => {
    setLoadingStates(prev => {
      switch (action.type) {
        case 'SET_UPLOADING':
          return { ...prev, uploading: action.payload };
        case 'SET_DELETING_ALBUM':
          return { ...prev, deletingAlbum: action.payload };
        case 'SET_DELETING_PHOTO':
          return { ...prev, deletingPhoto: action.payload };
        case 'SET_SAVING_PHOTO':
          return { ...prev, savingPhoto: action.payload };
        case 'SET_SORTING':
          return { ...prev, sorting: action.payload };
        case 'SET_LOADING_PHOTOS':
          return { ...prev, loadingPhotos: action.payload };
        default:
          return prev;
      }
    });
  }, []);

  // 获取当前活动的加载状态
  const getActiveLoadingState = useCallback(() => {
    if (loadingStates.deletingAlbum) return { type: 'deletingAlbum', message: '正在删除相册...' };
    if (loadingStates.deletingPhoto) return { type: 'deletingPhoto', message: '正在删除照片...' };
    if (loadingStates.savingPhoto) return { type: 'savingPhoto', message: '正在保存备注...' };
    if (loadingStates.sorting) return { type: 'sorting', message: '正在重新排序...' };
    if (loadingStates.uploading) return { type: 'uploading', message: '正在上传照片...' };
    if (loadingStates.loadingPhotos) return { type: 'loadingPhotos', message: '正在加载照片...' };
    return null;
  }, [loadingStates]);

  // 加载照片
  const loadPhotos = useCallback(async (sortOrder: 'asc' | 'desc' = 'desc') => {
    if (!albumId) return;

    try {
      dispatchLoading({ type: 'SET_LOADING_PHOTOS', payload: true });
      
      const { data: photosData, error: photosError } = await supabase
        .from('photos')
        .select('id, album_id, oss_path, user_id, file_name, description, created_at')
        .eq('album_id', albumId)
        .order('created_at', { ascending: sortOrder === 'asc' });

      if (photosError) throw photosError;

      if (isMountedRef.current) {
        setPhotos((photosData ?? []) as PhotoRow[]);
      }
    } catch (err: any) {
      if (isMountedRef.current) {
        console.error('Load photos error:', err);
        setError(err.message ?? '加载照片失败');
      }
    } finally {
      if (isMountedRef.current) {
        dispatchLoading({ type: 'SET_LOADING_PHOTOS', payload: false });
      }
    }
  }, [albumId, dispatchLoading]);

  // 删除照片
  const deletePhoto = useCallback(async (photoId: string) => {
    const photo = photos.find((p) => p.id === photoId);
    if (!photo) {
      if (isMountedRef.current) {
        setError('未找到该照片');
      }
      return;
    }

    try {
      dispatchLoading({ type: 'SET_DELETING_PHOTO', payload: photoId });

      const objectName = getOssObjectName(photo.oss_path);

      if (!objectName) {
        throw new Error('无法解析照片路径');
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('请先登录');
      }

      const { data, error: functionError } = await supabase.functions.invoke('delete-oss-file', {
        body: { objectName },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (functionError) {
        throw new Error(`删除失败: ${functionError.message}`);
      }

      if (!data || data.ok !== true) {
        throw new Error(data?.error || '删除 OSS 文件失败');
      }

      // 从本地状态中移除照片（而不是重新加载整个列表）
      if (isMountedRef.current) {
        setPhotos(prev => prev.filter(p => p.id !== photoId));
      }

      return { success: true, message: '照片删除成功！' };
    } catch (err: any) {
      if (isMountedRef.current) {
        console.error('Delete photo error:', err);
        setError(err.message ?? '删除照片失败');
      }
      return { success: false, message: err.message ?? '删除照片失败' };
    } finally {
      if (isMountedRef.current) {
        dispatchLoading({ type: 'SET_DELETING_PHOTO', payload: null });
      }
    }
  }, [photos, dispatchLoading]);

  // 更新照片描述
  const updatePhotoDescription = useCallback(async (photoId: string, description: string) => {
    try {
      dispatchLoading({ type: 'SET_SAVING_PHOTO', payload: photoId });

      const { error: updateError } = await supabase
        .from('photos')
        .update({ description: description || null })
        .eq('id', photoId);

      if (updateError) throw updateError;

      if (isMountedRef.current) {
        setPhotos(prev =>
          prev.map((p) => (p.id === photoId ? { ...p, description: description || null } : p))
        );
      }

      return { success: true, message: '备注保存成功！' };
    } catch (err: any) {
      if (isMountedRef.current) {
        console.error('Update description error:', err);
        setError('保存备注失败，请稍后重试');
      }
      return { success: false, message: '保存备注失败' };
    } finally {
      if (isMountedRef.current) {
        dispatchLoading({ type: 'SET_SAVING_PHOTO', payload: null });
      }
    }
  }, [dispatchLoading]);

  // 上传照片
  const uploadPhotos = useCallback(async (files: File[]) => {
    if (!albumId || files.length === 0) return;

    try {
      dispatchLoading({ type: 'SET_UPLOADING', payload: true });

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;

      if (!user) {
        if (isMountedRef.current) {
          setError('请先登录');
        }
        return;
      }

      const uploadedPhotoRows: PhotoRow[] = [];

      for (const file of files) {
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
          if (isMountedRef.current) {
            setError('获取上传权限失败');
          }
          return;
        }

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
        } = signData;

        const safeDir = dir || '';
        const objectKey = `${safeDir}${file.name}`;

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

        if (!ossResp.ok) {
          throw new Error('上传到 OSS 失败');
        }

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

        // 更新相册封面
        const { error: coverError } = await supabase
          .from('albums')
          .update({ cover_url: objectKey })
          .eq('id', albumId);

        if (!coverError) {
          // 如果需要更新相册封面，可以在这里处理
        }
      }

      // 添加新上传的照片到当前照片列表（而不是重新加载整个列表）
      if (uploadedPhotoRows.length > 0 && isMountedRef.current) {
        setPhotos(prev => [...uploadedPhotoRows, ...prev]);
      }
    } catch (err: any) {
      if (isMountedRef.current) {
        console.error('Upload photos error:', err);
        setError(err.message ?? '上传照片失败');
      }
    } finally {
      if (isMountedRef.current) {
        dispatchLoading({ type: 'SET_UPLOADING', payload: false });
      }
    }
  }, [albumId, dispatchLoading]);

  return {
    photos,
    loadingStates,
    error,
    dispatchLoading,
    getActiveLoadingState,
    loadPhotos,
    deletePhoto,
    updatePhotoDescription,
    uploadPhotos,
  };
};