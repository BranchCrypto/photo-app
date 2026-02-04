import React from 'react';

type JunimoLoadingProps = {
  text?: string;
};

export function JunimoLoading({ text = '加载中...' }: JunimoLoadingProps) {
  return (
    <div className="junimo-loading-backdrop" aria-busy="true" aria-live="polite">
      <div className="junimo-loading-card">
        <img src="/images/Junimo_Icon.png" alt="loading" className="junimo-loading-icon" />
        <div className="junimo-loading-text">{text}</div>
      </div>
    </div>
  );
}

