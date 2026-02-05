import { useEffect, useState } from 'react';

interface ToastNotificationProps {
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  duration?: number; // 自动消失时间，毫秒
  onClose: () => void;
}

export function ToastNotification({ message, type = 'info', duration = 3000, onClose }: ToastNotificationProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);

    const timer = setTimeout(() => {
      setIsVisible(false);
      // 等待动画结束后再调用 onClose
      setTimeout(onClose, 300);
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const bgColor = {
    info: 'bg-stardew-beige',
    success: 'bg-stardew-green',
    warning: 'bg-stardew-yellow',
    error: 'bg-stardew-red',
  }[type];

  return (
    <div className={`toast-notification toast-${type} ${isVisible ? 'toast-show' : 'toast-hide'}`}>
      <div className={`toast-content ${bgColor}`}>
        <span className="toast-message">{message}</span>
        <button 
          type="button" 
          className="toast-close"
          onClick={() => {
            setIsVisible(false);
            setTimeout(onClose, 300);
          }}
          aria-label="关闭"
        >
          ×
        </button>
      </div>
    </div>
  );
}