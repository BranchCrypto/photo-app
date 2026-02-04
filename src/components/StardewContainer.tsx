import type { ReactNode } from 'react';

interface StardewContainerProps {
  children: ReactNode;
  className?: string;
  variant?: 'parchment' | 'wood';
}

/**
 * 仿 stardew-memories 的相册木框/羊皮纸容器
 */
export function StardewContainer({
  children,
  className = '',
  variant = 'parchment',
}: StardewContainerProps) {
  const variantClass =
    variant === 'parchment' ? 'stardew-container-parchment' : 'stardew-container-wood';

  return (
    <div className={`stardew-container ${variantClass} ${className}`}>
      <div className="stardew-container-inner">{children}</div>
    </div>
  );
}

export default StardewContainer;

