import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { StardewContainer } from '../components/StardewContainer';
import { JunimoLoading } from '../components/JunimoLoading';
import { buildOssAlbumCoverUrl } from '../utils/ossHelpers';


type AlbumRow = {
  id: string;
  name: string;
  created_by: string | null;
  description?: string | null;
  cover_url?: string | null;
};

export function AlbumListPage() {
  const [albums, setAlbums] = useState<AlbumRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const PAGE_SIZE = 12;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creatingLoading, setCreatingLoading] = useState(false);
  const [creatingError, setCreatingError] = useState<string | null>(null);

  const navigate = useNavigate();

  useEffect(() => {
    const loadAlbums = async () => {
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

        // 查询当前用户参与的所有相册
        const { data, error: albumsError } = await supabase
          .from('album_members')
          .select('album_id, role, albums ( id, name, created_by, description, cover_url )')
          .eq('user_id', user.id);

        if (albumsError) throw albumsError;

        const mapped: AlbumRow[] =
          data
            ?.map((row: any) => row.albums)
            .filter(Boolean) ?? [];

        setAlbums(mapped);
        setVisibleCount(PAGE_SIZE);
      } catch (err: any) {
        console.error('Load albums error:', err);
        setError(err.message ?? '加载相册失败');
      } finally {
        setLoading(false);
      }
    };

    void loadAlbums();
  }, [navigate]);

  const handleCreateAlbum = async () => {
    const name = newName.trim();
    const description = newDesc.trim();
    setCreatingError(null);
    if (!name) {
      setCreatingError('请输入相册名');
      return;
    }

    try {
      setCreatingLoading(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) {
        setCreatingError('请先登录');
        return;
      }

      const { data: albumData, error: albumError } = await supabase
        .from('albums')
        .insert({
          name,
          description: description || null,
          created_by: user.id,
        })
        .select()
        .single();

      if (albumError) throw albumError;

      const { error: memberError } = await supabase.from('album_members').insert({
        album_id: albumData.id,
        user_id: user.id,
        role: 'owner',
      });

      if (memberError) throw memberError;

      setAlbums((prev) => [albumData as AlbumRow, ...prev]);
      setIsCreating(false);
      setNewName('');
      setNewDesc('');
    } catch (err: any) {
      console.error('Create album error:', err);
      setCreatingError(err.message ?? '创建相册失败');
    } finally {
      setCreatingLoading(false);
    }
  };

  const handleOpenAlbum = (album: AlbumRow) => {
    navigate(`/albums/${album.id}`, { state: { albumName: album.name } });
  };

  return (
    <div className="page album-list-page">
      <header className="album-list-header">
        <img
          src="/images/Horse_rider.png"
          alt="Horse rider"
          className="album-list-deco"
        />
        <div>
          <h1 className="album-list-title">我的相册</h1>
        </div>
      </header>

      {loading && <p className="hint">正在加载相册...</p>}
      {error && <p className="hint">加载相册失败：{error}</p>}

      {!loading && !error && albums.length === 0 && (
        <StardewContainer className="album-empty-card">
          <p className="album-empty-title">还没有相册</p>
          <p className="album-empty-text">点击右下角的 “+” 创建你的第一个星露谷相册吧。</p>
        </StardewContainer>
      )}

      <div className="album-list">
        {albums.slice(0, visibleCount).map((album) => (
          <button
            key={album.id}
            type="button"
            className="album-card"
            onClick={() => handleOpenAlbum(album)}
          >
            <StardewContainer className="album-card-inner">
              <div className="album-card-cover-wrap">
                <img
                  src={buildOssAlbumCoverUrl(album.cover_url ?? null)}
                  alt={album.name}
                  className="album-card-cover"
                />
              </div>
              <div className="album-card-body">
                <div className="album-card-title">{album.name}</div>
                {album.description && (
                  <div className="album-card-desc">{album.description}</div>
                )}
              </div>
            </StardewContainer>
          </button>
        ))}
      </div>

      {!loading && !error && albums.length > visibleCount && (
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <button
            type="button"
            className="secondary-btn"
            onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
          >
            加载更多相册
          </button>
        </div>
      )}

      {/* 创建相册弹层 */}
      {isCreating && (
        <div className="dialog-backdrop" onClick={() => !creatingLoading && setIsCreating(false)}>
          <div
            className="dialog-card"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <h2>创建新相册</h2>
            <label className="field">
              <span>相册名</span>
              <input
                type="text"
                placeholder="比如：春游合照"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </label>

            <label className="field">
              <span>描述</span>
              <input
                type="text"
                placeholder="简单介绍这个相册"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
              />
            </label>

            {creatingError && <p className="hint">{creatingError}</p>}

            <div className="dialog-actions">
              <button
                type="button"
                className="secondary-btn"
                disabled={creatingLoading}
                onClick={() => setIsCreating(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="primary-btn"
                disabled={creatingLoading}
                onClick={handleCreateAlbum}
              >
                {creatingLoading ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 右下角悬浮“+”按钮 */}
      <button
        type="button"
        className="fab-btn"
        onClick={() => {
          setIsCreating(true);
          setCreatingError(null);
        }}
      >
        +
      </button>

      {loading && <JunimoLoading text="正在加载相册..." />}
    </div>
  );
}

