export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    camera: <><rect x="3" y="6" width="14" height="12" rx="3"/><path d="m17 10 4-3v10l-4-3"/></>,
    compare: <><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 3v18m-5-9h2m6 0h2"/></>,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
    reset: <><path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/></>,
    save: <><path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/></>,
    check: <path d="m5 12 4 4 10-10"/>,
    shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/></>,
    pause: <><path d="M8 5v14M16 5v14"/></>,
    play: <path d="m8 4 12 8-12 8V4Z"/>,
    plus: <path d="M12 5v14M5 12h14"/>,
    close: <path d="m6 6 12 12M6 18 18 6"/>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/></>,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>,
    face: <><path d="M7 3H3v4m14-4h4v4M3 17v4h4m10 0h4v-4"/><path d="M8 9h.01M16 9h.01M12 10v4h-2m-2 3q4 3 8 0"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.info}</svg>;
}
