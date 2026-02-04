import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

interface InviteMemberFormProps {
  albumId: string;
}

export function InviteMemberForm({ albumId }: InviteMemberFormProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleInvite = async () => {
    const inputEmail = email.trim();
    setMessage(null);
    if (!inputEmail) {
      setMessage('请输入好友注册邮箱');
      return;
    }

    try {
      setLoading(true);

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', inputEmail)
        .maybeSingle();

      if (profileError) {
        // RLS 或其他错误
        throw profileError;
      }

      if (!profile) {
        // RLS 拦截或确实没有这个邮箱
        setMessage('未找到该邮箱对应的用户，或你没有查看权限');
        return;
      }

      const { error: insertError } = await supabase.from('album_members').insert({
        album_id: albumId,
        user_id: profile.id,
        role: 'editor',
      });

      if (insertError) {
        throw insertError;
      }

      setMessage('邀请成功，该用户已加入相册');
      setEmail('');
    } catch (err: any) {
      setMessage(err.message ?? '邀请失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="invite-card">
      <label className="field">
        <span>输入好友注册邮箱</span>
        <input
          type="email"
          placeholder="好友在本站注册用的邮箱"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <button className="primary-btn" disabled={loading} onClick={handleInvite}>
        {loading ? '邀请中...' : '邀请加入相册'}
      </button>
      {message && <p className="hint">{message}</p>}
    </div>
  );
}

