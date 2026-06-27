import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { Software } from '@/types';

interface AppIconProps {
  software: Software;
  size?: number;
  rounded?: string;
  className?: string;
}

function isImageIcon(icon: string | undefined): boolean {
  return !!icon && (icon.startsWith('data:image') || icon.startsWith('file://'));
}

export function AppIcon({ software, size = 40, rounded = 'rounded-xl', className }: AppIconProps) {
  const [failed, setFailed] = useState(false);
  const showImage = isImageIcon(software.icon) && !failed;

  const style = { width: size, height: size } as const;

  if (showImage) {
    return (
      <img
        src={software.icon}
        alt={software.name}
        style={style}
        onError={() => setFailed(true)}
        className={cn(rounded, 'object-contain shrink-0 bg-slate-800/40', className)}
      />
    );
  }

  const fontSize = Math.round(size * 0.34);
  return (
    <div
      role="img"
      aria-label={software.name}
      style={{ ...style, backgroundColor: software.color + '25', color: software.color, fontSize }}
      className={cn(rounded, 'flex items-center justify-center font-semibold shrink-0', className)}
    >
      {software.name.slice(0, 2)}
    </div>
  );
}
