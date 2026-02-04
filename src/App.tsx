import { Route, Routes, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { AlbumListPage } from './pages/AlbumListPage';
import { AlbumDetailPage } from './pages/AlbumDetailPage';

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as { albumName?: string } | null;
  const albumName = state?.albumName;

  let pathLabel = '';
  if (location.pathname.startsWith('/albums/')) {
    pathLabel = `相册 -- ${albumName || '当前相册'}`;
  } else if (location.pathname === '/albums') {
    pathLabel = '相册';
  } else if (location.pathname === '/login') {
    pathLabel = '登录';
  } else {
    pathLabel = location.pathname || '/';
  }

  return (
    <div className="app-root">
      {location.pathname !== '/login' && (
        <header className="top-nav">
          <div className="top-nav-inner">
            <button
              type="button"
              className="top-nav-path"
              onClick={() => navigate('/albums')}
            >
              <span style={{ marginRight: 4, color: '#fce8b0' }}>当前位置</span>
              <img
                src="/images/Map_Icon.png"
                alt=""
                style={{ width: 20, height: 20, marginRight: 4, verticalAlign: 'middle' }}
              />
              {location.pathname.startsWith('/albums/') && (
                <span>
                  相册 --{' '}
                  <img
                    src="/images/Book_Of_Stars.png"
                    alt=""
                    style={{ width: 18, height: 18, marginRight: 4, verticalAlign: 'middle' }}
                  />
                  {albumName || '当前相册'}
                </span>
              )}
              {location.pathname === '/albums' && <span>{pathLabel}</span>}
              {!location.pathname.startsWith('/albums') &&
                location.pathname !== '/albums' && <span>{pathLabel}</span>}
            </button>
            <img src="/images/logo.png" alt="Stardew Valley" className="top-nav-logo" />
            <div className="top-nav-spacer" />
          </div>
        </header>
      )}

      <main className="app-main">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/albums" element={<AlbumListPage />} />
          <Route path="/albums/:id" element={<AlbumDetailPage />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;

