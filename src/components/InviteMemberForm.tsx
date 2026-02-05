import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { StardewContainer } from './StardewContainer';

interface InviteMemberFormProps {
  albumId: string;
  isOpen: boolean;
  onClose: () => void;
  onShowMessage?: (message: string, type?: 'success' | 'error') => void; // 新增可选的回调函数
}

export function InviteMemberForm({ albumId, isOpen, onClose, onShowMessage }: InviteMemberFormProps) {
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
        throw profileError;
      }

      if (!profile) {
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

      const successMessage = '邀请成功，该用户已加入相册';
      if (onShowMessage) {
        onShowMessage(successMessage, 'success');
      } else {
        setMessage(successMessage);
      }
      setEmail('');
      // 关闭弹窗并延迟一小段时间让用户看到成功消息
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error('Invite member error:', err);
      const errorMessage = err.message ?? '邀请失败，请稍后重试';
      if (onShowMessage) {
        onShowMessage(errorMessage, 'error');
      } else {
        setMessage(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBackdropClick = () => {
    if (!loading) onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="invite-modal-backdrop"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-modal-title"
    >
      <div
        className="invite-modal-wrap"
        onClick={(e) => e.stopPropagation()}
      >
        <StardewContainer variant="parchment" className="invite-modal-card">
          <div className="invite-modal-header">
            <h2 id="invite-modal-title" className="invite-modal-title">
              邀请好友加入相册
            </h2>
            <button
              type="button"
              className="invite-modal-close"
              onClick={onClose}
              disabled={loading}
              aria-label="关闭"
            >
              ×
            </button>
          </div>
          <div className="invite-modal-body">
            <label className="field">
              <span>输入好友注册邮箱</span>
              <input
                type="email"
                placeholder="好友在本站注册用的邮箱"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <button
              className="primary-btn"
              disabled={loading}
              onClick={handleInvite}
            >
              {loading ? '邀请中...' : '邀请加入相册'}
            </button>
            {message && <p className="hint">{message}</p>}
          </div>
        </StardewContainer>
      </div>
    </div>
  );
}
