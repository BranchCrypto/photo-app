import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { showError } from '../utils/errorHandler';

// 防止重复请求的间隔时间（毫秒）
const RATE_LIMIT_MS = 5000;

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lastRequestTime, setLastRequestTime] = useState<number | null>(null);

  // 简单的密码加密/解密函数（仅作基础保护）
  const encryptPassword = (password: string): string => {
    // 使用简单的异或加密，实际项目中应使用更安全的方法
    const key = 'stardew_valley_2024';
    let result = '';
    for (let i = 0; i < password.length; i++) {
      result += String.fromCharCode(password.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return btoa(result); // Base64 编码
  };

  const decryptPassword = (encryptedPassword: string): string => {
    try {
      const key = 'stardew_valley_2024';
      const decoded = atob(encryptedPassword);
      let result = '';
      for (let i = 0; i < decoded.length; i++) {
        result += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
      }
      return result;
    } catch (e) {
      return '';
    }
  };

  // 页面加载时检查是否保存了凭证
  useEffect(() => {
    const savedCredentials = localStorage.getItem('stardew_login_credentials');
    if (savedCredentials) {
      try {
        const { email: savedEmail, password: encryptedPassword, remember } = JSON.parse(savedCredentials);
        if (remember && savedEmail) {
          setEmail(savedEmail);
          setRememberMe(true);
          // 解密并设置密码
          if (encryptedPassword) {
            const decryptedPassword = decryptPassword(encryptedPassword);
            if (decryptedPassword) {
              setPassword(decryptedPassword);
            }
          }
        }
      } catch (e) {
        // 如果解析失败，清除无效数据
        localStorage.removeItem('stardew_login_credentials');
      }
    }
  }, []);

  const navigate = useNavigate();

  const handleSubmit = async () => {
    const now = Date.now();
    if (lastRequestTime && now - lastRequestTime < RATE_LIMIT_MS) {
      showError('操作过于频繁，请稍后再试', setMessage);
      return;
    }

    setLastRequestTime(now);
    setMessage(null);
    if (!email || !password) {
      showError('请输入邮箱和密码', setMessage);
      return;
    }
    try {
      setLoading(true);
      
      // 处理记住密码逻辑
      if (rememberMe) {
        // 保存邮箱、加密后的密码和记住状态
        localStorage.setItem('stardew_login_credentials', JSON.stringify({
          email,
          password: encryptPassword(password),
          remember: true
        }));
      } else {
        // 清除保存的凭证
        localStorage.removeItem('stardew_login_credentials');
      }

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      navigate('/albums');
    } catch (err: any) {
      console.error('Login error:', err);
      showError(err.message ?? '操作失败，请稍后重试', setMessage);
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

        <label className="field checkbox-field">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
          />
          <span>记住账号和密码</span>
        </label>

        <button className="primary-btn" disabled={loading} onClick={handleSubmit}>
          {loading ? '处理中...' : '登录'}
        </button>

        {message && <p className="hint">{message}</p>}
      </div>
    </div>
  );
}

