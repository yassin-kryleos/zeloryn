import React from 'react';

interface ZelorynGlyphProps {
  size?: number;
  className?: string;
  color?: string;
}

export const ZelorynGlyph: React.FC<ZelorynGlyphProps> = ({
  size = 18,
  className = '',
  color = 'currentColor'
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      <circle cx="16" cy="7.5" r="3.4" fill={color} />
      <line
        x1="16"
        y1="10"
        x2="8"
        y2="20.5"
        stroke={color}
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <line
        x1="16"
        y1="10"
        x2="24"
        y2="20.5"
        stroke={color}
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <circle
        cx="8"
        cy="24"
        r="3.4"
        stroke={color}
        strokeWidth="2.1"
        fill="none"
      />
      <circle
        cx="24"
        cy="24"
        r="3.4"
        stroke={color}
        strokeWidth="2.1"
        fill="none"
      />
    </svg>
  );
};

export const ZelorynLockup: React.FC<{
  size?: 'sm' | 'md' | 'lg';
  tile?: boolean;
  className?: string;
  tagline?: boolean;
}> = ({
  size = 'sm',
  tile = false,
  className = '',
  tagline = false
}) => {
  const glyphSizes = { sm: 16, md: 22, lg: 32 };
  const textSizes = {
    sm: 'text-xs tracking-normal',
    md: 'text-sm tracking-normal',
    lg: 'text-xl tracking-tight'
  };

  return (
    <div className={`inline-flex items-center gap-2 select-none ${className}`}>
      {tile ? (
        <div className="w-10 h-10 rounded-lg bg-[var(--surface-header)] border border-[var(--line)] flex items-center justify-center shrink-0">
          <ZelorynGlyph size={22} className="text-[var(--accent)]" />
        </div>
      ) : (
        <ZelorynGlyph size={glyphSizes[size]} className="text-[var(--accent)]" />
      )}
      <div className="flex flex-col">
        <div className={`font-mono font-medium ${textSizes[size]} text-[var(--text-strong)] flex items-baseline leading-none`}>
          <span>zeloryn</span>
          <span className="text-[var(--accent)] ml-[1px] font-bold animate-pulse">_</span>
        </div>
        {tagline && (
          <span className="font-sans text-[11px] text-[var(--text-muted)] mt-0.5 font-normal">
            The Free, Open-Source, Local-First AI Software Engineering Cockpit.
          </span>
        )}
      </div>
    </div>
  );
};

export default ZelorynLockup;
