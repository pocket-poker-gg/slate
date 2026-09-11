// Inline SF-symbol-style icon set (stroke based, consistent 1.7 weight)
import React from 'react';

const I = ({ children, size = 24 }: { children: React.ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

export const IconHome = () => <I><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M9.5 21v-6h5v6" /></I>;
export const IconCompass = () => <I><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></I>;
export const IconLibrary = () => <I><path d="M4 4h5v16H4zM10.5 4h5v16h-5z" /><path d="m16 5.5 4-.8 3.4 15.3-4 .8" transform="scale(0.9) translate(1.6 0.4)" /></I>;
export const IconDiary = () => <I><rect x="4" y="5" width="16" height="16" rx="2.5" /><path d="M4 10h16M8.5 3v4M15.5 3v4" /></I>;
export const IconProfile = () => <I><circle cx="12" cy="8" r="4" /><path d="M4.5 21c1.4-3.6 4.2-5.5 7.5-5.5s6.1 1.9 7.5 5.5" /></I>;
export const IconSearch = () => <I><circle cx="11" cy="11" r="7" /><path d="m20 20-3.8-3.8" /></I>;
export const IconStar = ({ fill = 'none' }: { fill?: string }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.3-5.7-3.1-5.7 3.1 1.2-6.3L2.8 9.5l6.4-.8z" />
  </svg>
);
export const IconStarHalf = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
    <defs><linearGradient id="halfgrad"><stop offset="50%" stopColor="currentColor" /><stop offset="50%" stopColor="transparent" /></linearGradient></defs>
    <path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.3-5.7-3.1-5.7 3.1 1.2-6.3L2.8 9.5l6.4-.8z" fill="url(#halfgrad)" />
  </svg>
);
export const IconPlus = () => <I><path d="M12 5v14M5 12h14" /></I>;
export const IconCheck = () => <I><path d="m4.5 12.5 5 5 10-11" /></I>;
export const IconHeart = ({ filled }: { filled?: boolean }) => <I>{filled ? <path d="M12 20.5S3 14.7 3 8.9C3 5.6 5.4 3.5 8 3.5c1.7 0 3.2.9 4 2.3.8-1.4 2.3-2.3 4-2.3 2.6 0 5 2.1 5 5.4 0 5.8-9 11.6-9 11.6z" fill="currentColor" stroke="none" /> : <path d="M12 20.5S3 14.7 3 8.9C3 5.6 5.4 3.5 8 3.5c1.7 0 3.2.9 4 2.3.8-1.4 2.3-2.3 4-2.3 2.6 0 5 2.1 5 5.4 0 5.8-9 11.6-9 11.6z" />}</I>;
export const IconChevronR = () => <I><path d="m9 5 7 7-7 7" /></I>;
export const IconChevronL = () => <I><path d="m15 5-7 7 7 7" /></I>;
export const IconX = () => <I><path d="M6 6l12 12M18 6L6 18" /></I>;
export const IconClock = () => <I><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></I>;
export const IconPlay = () => <I><path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none" /></I>;
export const IconShare = () => <I><path d="M12 3v12M8 6.5 12 3l4 3.5" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" /></I>;
export const IconDownload = () => <I><path d="M12 3v12M8 11.5 12 15l4-3.5" /><path d="M5 19h14" /></I>;
export const IconUpload = () => <I><path d="M12 15V3M8 6.5 12 3l4 3.5" /><path d="M5 19h14" /></I>;
export const IconSparkle = () => <I><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M18.5 15.5l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z" /></I>;
export const IconTune = () => <I><path d="M4 8h10M18 8h2M4 16h2M10 16h10" /><circle cx="16" cy="8" r="2.2" /><circle cx="8" cy="16" r="2.2" /></I>;
export const IconEye = () => <I><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></I>;
export const IconEyeOff = () => <I><path d="M4 4l16 16" /><path d="M10.5 6.1A9.8 9.8 0 0 1 12 6c6 0 9.5 6 9.5 6a17.4 17.4 0 0 1-3.2 3.9M6.6 6.9A16.7 16.7 0 0 0 2.5 12S6 18 12 18c1.5 0 2.8-.4 4-1" /></I>;
export const IconTv = () => <I><rect x="3" y="6.5" width="18" height="13" rx="2.5" /><path d="m8.5 2.5 3.5 4 3.5-4" /></I>;
export const IconFilm = () => <I><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M7.5 4v16M16.5 4v16M3 9h4.5M3 15h4.5M16.5 9H21M16.5 15H21" /></I>;
export const IconTrash = () => <I><path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13.5h9l1-13.5" /></I>;
export const IconMore = () => <I><circle cx="12" cy="5.5" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /><circle cx="12" cy="18.5" r="1.2" fill="currentColor" /></I>;
export const IconList = () => <I><path d="M8.5 6.5H21M8.5 12H21M8.5 17.5H21" /><circle cx="4" cy="6.5" r="1.3" fill="currentColor" stroke="none" /><circle cx="4" cy="12" r="1.3" fill="currentColor" stroke="none" /><circle cx="4" cy="17.5" r="1.3" fill="currentColor" stroke="none" /></I>;
export const IconGrid = () => <I><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></I>;
export const IconBolt = () => <I><path d="M13 2.5 4.5 13.5H11l-1 8L18.5 10H12z" /></I>;
export const IconCalendar = () => <I><rect x="4" y="5" width="16" height="16" rx="2.5" /><path d="M4 10h16M8.5 3v4M15.5 3v4" /></I>;
export const IconGlobe = () => <I><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.8 2.6 4 5.7 4 9s-1.2 6.4-4 9c-2.8-2.6-4-5.7-4-9s1.2-6.4 4-9z" /></I>;
export const IconShield = () => <I><path d="M12 2.5 20 6v6c0 5-3.5 8.2-8 9.5C7.5 20.2 4 17 4 12V6z" /></I>;
export const IconRefresh = () => <I><path d="M20 12a8 8 0 1 1-2.3-5.6M20 3v4h-4" /></I>;
