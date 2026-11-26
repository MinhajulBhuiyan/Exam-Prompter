type IconProps = { size?: number };

function Svg({ size = 20, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

export const PlayIcon = (p: IconProps) => (
  <Svg {...p}><path d="M8 5.5v13a.6.6 0 0 0 .9.5l10.2-6.5a.6.6 0 0 0 0-1L8.9 5a.6.6 0 0 0-.9.5Z" fill="currentColor" stroke="none" /></Svg>
);
export const PauseIcon = (p: IconProps) => (
  <Svg {...p}><rect x="6.5" y="5" width="3.6" height="14" rx="1" fill="currentColor" stroke="none" /><rect x="13.9" y="5" width="3.6" height="14" rx="1" fill="currentColor" stroke="none" /></Svg>
);
export const ReplayIcon = (p: IconProps) => (
  <Svg {...p}><path d="M4 12a8 8 0 1 0 2.4-5.7" /><path d="M4 4v4.5h4.5" /></Svg>
);
export const NextIcon = (p: IconProps) => (
  <Svg {...p}><path d="M5 12h13" /><path d="m13 6 6 6-6 6" /></Svg>
);
export const PrevIcon = (p: IconProps) => (
  <Svg {...p}><path d="M19 12H6" /><path d="m11 6-6 6 6 6" /></Svg>
);
export const EyeIcon = (p: IconProps) => (
  <Svg {...p}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.8" /></Svg>
);
export const EyeOffIcon = (p: IconProps) => (
  <Svg {...p}><path d="M3 3l18 18" /><path d="M10.6 5.6A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-3 3.7M6.6 6.6C4 8.3 2.5 12 2.5 12S6 18.5 12 18.5a9 9 0 0 0 4.4-1.1" /><path d="M9.9 9.9a2.8 2.8 0 0 0 4.2 4.2" /></Svg>
);
export const SpeakerIcon = (p: IconProps) => (
  <Svg {...p}><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M15.5 9a4 4 0 0 1 0 6" /><path d="M18 6.5a7.5 7.5 0 0 1 0 11" /></Svg>
);
export const AlertIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5" /><path d="M12 16.5h.01" /></Svg>
);
export const CheckIcon = (p: IconProps) => (
  <Svg {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></Svg>
);
