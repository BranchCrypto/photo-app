import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lastRequestTime, setLastRequestTime] = useState<number | null>(null);

  const navigate = useNavigate();

  const handleSubmit = async () => {
    const now = Date.now();
    if (lastRequestTime && now - lastRequestTime < 5000) {
      setMessage('操作过于频繁，请稍后再试');
      return;
    }

    setLastRequestTime(now);
    setMessage(null);
    if (!email || !password) {
      setMessage('请输入邮箱和密码');
      return;
    }
    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      navigate('/albums');
    } catch (err: any) {
      setMessage(err.message ?? '操作失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page login-page">
      <div className="logo-wrap">
        <img src="/images/logo.png" alt="Stardew Valley" className="logo-image" />
      </div>
      <h1>Stardew Valley Photo</h1>
      <p className="subtitle">我们的星露谷相册</p>

      <div className="card">
        <label className="field">
          <span>邮箱</span>
          <input
            type="email"
            placeholder="请输入邮箱"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <label className="field">
          <span>密码</span>
          <input
            type="password"
            placeholder="请输入密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        <button className="primary-btn" disabled={loading} onClick={handleSubmit}>
          {loading ? '处理中...' : '登录'}
        </button>

        {message && <p className="hint">{message}</p>}
      </div>
    </div>
  );
}

