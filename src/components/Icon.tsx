import type { ReactNode } from 'react';

const paths: Record<string, ReactNode> = {
  flag: (
    <>
      <path d="M5.5 21V3.5" />
      <path d="M5.5 4.5h12l-2.5 4.2 2.5 4.3h-12" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21.5s7-6.1 7-11.8a7 7 0 1 0-14 0c0 5.7 7 11.8 7 11.8z" />
      <circle cx="12" cy="9.7" r="2.5" />
    </>
  ),
  star: <path d="M12 3.4l2.6 5.5 6 .8-4.4 4.2 1.1 6L12 17l-5.3 2.9 1.1-6L3.4 9.7l6-.8z" />,
  gear: (
    <>
      <path d="M10.3 3h3.4l.5 2.4 1.7.7 2.1-1.3 2.4 2.4-1.3 2.1.7 1.7 2.4.5v3.4l-2.4.5-.7 1.7 1.3 2.1-2.4 2.4-2.1-1.3-1.7.7-.5 2.4h-3.4l-.5-2.4-1.7-.7-2.1 1.3-2.4-2.4 1.3-2.1-.7-1.7-2.4-.5v-3.4l2.4-.5.7-1.7-1.3-2.1 2.4-2.4 2.1 1.3 1.7-.7z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  chart: (
    <>
      <path d="M4.5 20.5h15" />
      <path d="M7 17v-5.5" />
      <path d="M12 17V6" />
      <path d="M17 17v-8" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="8.2" r="3.8" />
      <path d="M4.8 20.2c.9-3.6 3.7-5.7 7.2-5.7s6.3 2.1 7.2 5.7" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8.5h3.2L8.8 6h6.4l1.6 2.5H20v11H4z" />
      <circle cx="12" cy="13.5" r="3.4" />
    </>
  ),
  trash: (
    <>
      <path d="M4.5 6.5h15" />
      <path d="M9.5 6.5V4.5h5v2" />
      <path d="M6.5 6.5l1 13.5h9l1-13.5" />
    </>
  ),
  edit: <path d="M4.5 19.5l1-4.5L16 4.5l3.5 3.5L9 18.5zM14 6.5l3.5 3.5" />,
  chevron: <path d="M9 5l7 7-7 7" />,
  'chevron-left': <path d="M15 5l-7 7 7 7" />,
  'chevron-down': <path d="M5 9l7 7 7-7" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
  locate: <path d="M20.5 3.5L3.5 10.8l6.7 2.5 2.5 6.7z" />,
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="16" rx="3" />
      <path d="M4 10h16M8 3v4M16 3v4" />
    </>
  ),
  share: (
    <>
      <path d="M12 15V3.5M8 7l4-4 4 4" />
      <path d="M7 10H6a1 1 0 0 0-1 1v8.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V11a1 1 0 0 0-1-1h-1" />
    </>
  ),
  directions: (
    <>
      <path d="M12 3l9 9-9 9-9-9z" />
      <path d="M9 14v-2.5a1 1 0 0 1 1-1h5M13 8l2 2.500-2 2.500" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c3.500 3.500 3.500 14.500 0 18M12 3c-3.500 3.500-3.500 14.500 0 18" />
    </>
  ),
  phone: <path d="M5 4h4l2 5-2.500 1.500a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />,
  mail: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
      <path d="M4 7.5l8 6 8-6" />
    </>
  ),
  check: <path d="M4.500 12.500l5 5 10-11" />,
  'check-circle': (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M7.800 12.300l3 3 5.500-6.300" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  refresh: (
    <>
      <path d="M20 11a8 8 0 1 0-2.300 5.700" />
      <path d="M20 4v7h-7" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  filter: (
    <>
      <path d="M4 7h8M18 7h2M4 17h2M12 17h8" />
      <circle cx="15" cy="7" r="2.500" />
      <circle cx="9" cy="17" r="2.500" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.500M12 7.800v.2" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2.500" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  map: <path d="M3 6.500l6-2.500 6 2.500 6-2.500v13.500l-6 2.500-6-2.500-6 2.500zM9 4v13.500M15 6.500V20" />,
  list: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.700 0l-3 3a4 4 0 0 0 5.700 5.700l1-1" />
    </>
  ),
  golf: (
    <>
      <path d="M12 3v14" />
      <path d="M12 3.500l7 3-7 3" />
      <ellipse cx="12" cy="19.500" rx="7" ry="2" />
    </>
  ),
};

export type IconName = keyof typeof paths;

interface Props {
  name: IconName;
  size?: number;
  fill?: boolean;
  strokeWidth?: number;
  className?: string;
}

export function Icon({ name, size = 22, fill = false, strokeWidth = 1.8, className }: Props) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={fill ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}
