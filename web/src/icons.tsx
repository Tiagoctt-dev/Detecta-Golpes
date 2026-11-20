import type { ReactNode } from 'react';

type IconProps = { size?: number; className?: string };

function base(paths: ReactNode, { size = 16, className }: IconProps) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}
      aria-hidden="true" focusable="false"
    >
      {paths}
    </svg>
  );
}

export const ShieldCheckIcon = (p: IconProps = {}) => base(
  <>
    <path d="M12 3l7 3v5c0 5-3.2 8.5-7 10-3.8-1.5-7-5-7-10V6l7-3Z" />
    <path d="M9 12l2 2 4-4" />
  </>, p,
);

export const AlertTriangleIcon = (p: IconProps = {}) => base(
  <>
    <path d="M12 3.5 2.5 20h19L12 3.5Z" />
    <path d="M12 10v4" />
    <path d="M12 17h.01" />
  </>, p,
);

export const OctagonAlertIcon = (p: IconProps = {}) => base(
  <>
    <path d="M8 2.5h8L21.5 8v8L16 21.5H8L2.5 16V8L8 2.5Z" />
    <path d="M12 7.5v5" />
    <path d="M12 15.5h.01" />
  </>, p,
);

export const PhoneIcon = (p: IconProps = {}) => base(
  <path d="M4 4.5c0-.6.4-1 1-1h3l1.5 4-2 1.5a11 11 0 0 0 5.5 5.5l1.5-2 4 1.5v3c0 .6-.4 1-1 1A14.5 14.5 0 0 1 4 5.5v-1Z" />, p,
);

export const PhoneOffIcon = (p: IconProps = {}) => base(
  <>
    <path d="M4 4.5c0-.6.4-1 1-1h3l1.5 4-2 1.5a11.3 11.3 0 0 0 2.4 3.3" />
    <path d="M12.6 14.9a11 11 0 0 0 2.9 1.6l1.5-2 4 1.5v3c0 .6-.4 1-1 1a14.4 14.4 0 0 1-5.6-1.6" />
    <path d="M3 3l18 18" />
  </>, p,
);

export const BellOffIcon = (p: IconProps = {}) => base(
  <>
    <path d="M9.5 4.5A2.5 2.5 0 0 1 14.5 5v.7c2 1 3.3 3 3.3 5.6V15l1.7 2H8" />
    <path d="M6 17v-5.7c0-1 .2-1.9.7-2.7" />
    <path d="M10.5 20a1.8 1.8 0 0 0 3 0" />
    <path d="M3 3l18 18" />
  </>, p,
);

export const HomeIcon = (p: IconProps = {}) => base(
  <>
    <path d="M4 11.5 12 4l8 7.5" />
    <path d="M6 10v9.5a.5.5 0 0 0 .5.5H10v-5h4v5h3.5a.5.5 0 0 0 .5-.5V10" />
  </>, p,
);

export const ClockIcon = (p: IconProps = {}) => base(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </>, p,
);

export const SearchIcon = (p: IconProps = {}) => base(
  <>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M20 20l-4.8-4.8" />
  </>, p,
);

export const ListIcon = (p: IconProps = {}) => base(
  <>
    <path d="M9 6h11" /><path d="M9 12h11" /><path d="M9 18h11" />
    <path d="M4.5 6h.01" /><path d="M4.5 12h.01" /><path d="M4.5 18h.01" />
  </>, p,
);

export const SettingsIcon = (p: IconProps = {}) => base(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 13.5a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.9 2.9l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.1a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.9-2.9l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H4a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.9-2.9l.1.1a1.7 1.7 0 0 0 1.9.3H10a1.7 1.7 0 0 0 1-1.6V4a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.9 2.9l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.6 1H20a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1.1Z" />
  </>, p,
);

export function LevelIcon({ level, size = 13 }: { level: RiskLevelLike; size?: number }) {
  if (level === 'baixo') return <ShieldCheckIcon size={size} />;
  if (level === 'alto') return <OctagonAlertIcon size={size} />;
  return <AlertTriangleIcon size={size} />;
}

type RiskLevelLike = 'baixo' | 'moderado' | 'suspeito' | 'alto';

export function ActionIcon({ action, size = 13 }: { action: 'permitir' | 'silenciar' | 'bloquear'; size?: number }) {
  if (action === 'permitir') return <PhoneIcon size={size} />;
  if (action === 'silenciar') return <BellOffIcon size={size} />;
  return <OctagonAlertIcon size={size} />;
}
