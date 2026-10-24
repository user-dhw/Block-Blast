import type { CSSProperties } from 'react';

type IconName = 'settings' | 'sound' | 'muted' | 'help' | 'refresh' | 'arrow' | 'crown' | 'sparkles' | 'grid' | 'check' | 'close' | 'pause' | 'leaf' | 'target' | 'keyboard' | 'chevron' | 'hammer';
const paths: Record<IconName, React.ReactNode> = {
  settings: <><path d="m9 3 .5 2a7 7 0 0 1 5 0l.5-2 3 2-1 2a7 7 0 0 1 2.5 4l2 .5v3l-2 .5a7 7 0 0 1-2.5 4l1 2-3 2-.5-2a7 7 0 0 1-5 0l-.5 2-3-2 1-2A7 7 0 0 1 4.5 15l-2-.5v-3l2-.5A7 7 0 0 1 7 7L6 5Z"/><circle cx="12" cy="12.5" r="3"/></>,
  sound: <><path d="M11 4 6 8H3v8h3l5 4Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></>,
  muted: <><path d="M11 4 6 8H3v8h3l5 4Z"/><path d="m16 9 5 6m0-6-5 6"/></>,
  help: <><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1.5 1-1.5 1-1.5 2m0 3h.01"/></>,
  refresh: <><path d="M20 10a8 8 0 1 0-1 7M20 4v6h-6"/></>,
  arrow: <><path d="M4 12h16m-6-6 6 6-6 6"/></>,
  crown: <><path d="m3 6 5 5 4-7 4 7 5-5-2 12H5Z"/><path d="M6 21h12"/></>,
  sparkles: <><path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5Z"/><path d="m20 2 .5 1.5L22 4l-1.5.5L20 6l-.5-1.5L18 4l1.5-.5Z"/></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  close: <path d="m6 6 12 12M6 18 18 6"/>,
  pause: <><path d="M8 5v14M16 5v14"/></>,
  leaf: <><path d="M20 3C6 2 2 11 7 16s14 0 13-13Z"/><path d="m4 21 11-11"/></>,
  target: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></>,
  keyboard: <><rect x="2" y="5" width="20" height="14" rx="3"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M7 16h10"/></>,
  chevron: <path d="m9 5 7 7-7 7"/>,
  hammer: <><path d="m14 10-9 11-3-3 10-10"/><path d="m9 5 4-3 8 7-4 4Z"/><path d="m16 6 3 3"/></>,
};

export default function Icon({ name, className, style }: { name: IconName; className?: string; style?: CSSProperties }) {
  return <svg className={className} style={style} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
