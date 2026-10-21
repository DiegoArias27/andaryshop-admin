import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export function BackIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M15 5 8 12l7 7" />
    </svg>
  )
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

export function PackageIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="m3.5 7.5 8.5-4 8.5 4-8.5 4-8.5-4Z" />
      <path d="M3.5 7.5v9l8.5 4 8.5-4v-9" />
      <path d="M12 11.5v9" />
    </svg>
  )
}

export function TagIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M11.5 3.5H5.5a2 2 0 0 0-2 2v6l9.6 9.6a2 2 0 0 0 2.8 0l5.2-5.2a2 2 0 0 0 0-2.8L11.5 3.5Z" />
      <circle cx="8" cy="8" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function BarcodeIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 5v14M8 5v14M11 5v14M14 5v14M17 5v9M20 5v14" />
    </svg>
  )
}

export function LogoutIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  )
}

export function SearchIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}

export function EditIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
    </svg>
  )
}

export function TrashIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 7h16" />
      <path d="M9 7V4.8A.8.8 0 0 1 9.8 4h4.4a.8.8 0 0 1 .8.8V7" />
      <path d="M6 7l.9 12.2a1.5 1.5 0 0 0 1.5 1.4h7.2a1.5 1.5 0 0 0 1.5-1.4L18 7" />
    </svg>
  )
}

export function PlusIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function MinusIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 12h14" />
    </svg>
  )
}

export function UploadCloudIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M7 18a4.5 4.5 0 0 1-1-8.9 5.5 5.5 0 0 1 10.8-1.7A4 4 0 0 1 17 18H7Z" />
      <path d="M12 12v6M9.5 14.5 12 12l2.5 2.5" />
    </svg>
  )
}

export function ScanIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 8V6a2 2 0 0 1 2-2h2M20 8V6a2 2 0 0 0-2-2h-2M4 16v2a2 2 0 0 0 2 2h2M20 16v2a2 2 0 0 1-2 2h-2" />
      <path d="M4 12h16" />
    </svg>
  )
}

export function MenuIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  )
}

export function HistoryIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  )
}

export function AwardIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="8" r="5" />
      <path d="m8.5 12.5-1.5 7 5-2.5 5 2.5-1.5-7" />
    </svg>
  )
}

export function LayersIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 13 9 5 9-5" />
    </svg>
  )
}

export function ImageIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="m4 19 6-6 4 4 3-3 3 3" />
    </svg>
  )
}

export function PercentIcon({ fill, ...props }: IconProps) {
  // fill is only ever passed by a caller that wants a "solid" look (e.g. the
  // Productos filter chips) — the diagonal line stays a stroke either way
  // (an open path has no interior to fill), only the two dots go solid.
  const filled = !!fill && fill !== 'none'
  return (
    <svg {...base} {...props} fill={fill ?? 'none'}>
      <path d="M5 19 19 5" fill="none" />
      <circle cx="7" cy="7" r="2.3" fill={filled ? 'currentColor' : 'none'} />
      <circle cx="17" cy="17" r="2.3" fill={filled ? 'currentColor' : 'none'} />
    </svg>
  )
}

export function LockIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
      <path d="M7.5 10.5V7a4.5 4.5 0 0 1 9 0v3.5" />
    </svg>
  )
}

export function UnlockIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
      <path d="M7.5 10.5V7a4.5 4.5 0 0 1 8.7-1.6" />
    </svg>
  )
}

export function DragHandleIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="9" cy="6" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="6" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="9" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="9" cy="18" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="18" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function CheckSquareIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <path d="m8 12 2.5 2.5L16 9" />
    </svg>
  )
}

export function SquareIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
    </svg>
  )
}

export function CopyIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </svg>
  )
}

export function CropIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 2v14a2 2 0 0 0 2 2h14" />
      <path d="M18 22V8a2 2 0 0 0-2-2H2" />
    </svg>
  )
}

export function StarIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 2.5l2.9 6.06 6.6.77-4.9 4.5 1.28 6.57L12 17.1l-5.88 3.3 1.28-6.57-4.9-4.5 6.6-.77z" />
    </svg>
  )
}

export function SettingsIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M15 5 8 12l7 7" />
    </svg>
  )
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="m9 5 7 7-7 7" />
    </svg>
  )
}

export function BoldIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M7 4h6a3.5 3.5 0 0 1 0 7H7z" />
      <path d="M7 11h7a3.5 3.5 0 0 1 0 7H7z" />
    </svg>
  )
}

export function FontIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 19 10 5h1l5 14" />
      <path d="M6.5 15h7.5" />
      <path d="m15 19 3.5-9L22 19" />
      <path d="M16.3 16h4.4" />
    </svg>
  )
}

export function TextSizeIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 7V5h11v2" />
      <path d="M9.5 5v14" />
      <path d="M7 19h5" />
      <path d="M16 12h5M18.5 9v6" />
    </svg>
  )
}

export function PaletteIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3a9 8 0 0 0 0 16c1.2 0 1.6-.7 1.2-1.5-.3-.6-.1-1.3.6-1.5H15a5 5 0 0 0 5-5 8 8 0 0 0-8-8Z" />
      <circle cx="8" cy="11" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="8" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="16" cy="11" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function ShadowIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="4" y="4" width="12" height="12" rx="2" />
      <path d="M9 20h9a2 2 0 0 0 2-2V9" strokeDasharray="2.5 3" />
    </svg>
  )
}

export function BorderBoxIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="4" y="4" width="16" height="16" rx="2" strokeDasharray="3 3" />
    </svg>
  )
}

export function FillBoxIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor" fillOpacity="0.25" />
    </svg>
  )
}

export function RadiusIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 14V9a5 5 0 0 1 5-5h5" />
      <path d="M4 14v6h6" />
      <path d="M20 4v16H10" />
    </svg>
  )
}

export function PaddingIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
      <rect x="8" y="8" width="8" height="8" rx="1" strokeDasharray="2 2.4" />
    </svg>
  )
}

export function LinkIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9.5 14.5 14.5 9.5" />
      <path d="M8 16 5.5 18.5a3 3 0 0 1-4.2-4.2L4 11.8" />
      <path d="M16 8l2.5-2.5a3 3 0 0 1 4.2 4.2L20 12.2" />
    </svg>
  )
}

export function UnlinkIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9.5 14.5 11 13" />
      <path d="M14.5 9.5 13 11" />
      <path d="M8 16 5.5 18.5a3 3 0 0 1-4.2-4.2L4 11.8" />
      <path d="M16 8l2.5-2.5a3 3 0 0 1 4.2 4.2L20 12.2" />
      <path d="M3 3l18 18" />
    </svg>
  )
}

export function AlignLeftIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 6h16M4 12h10M4 18h13" />
    </svg>
  )
}

export function AlignCenterIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 6h16M7 12h10M5.5 18h13" />
    </svg>
  )
}

export function GridIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13" y="3.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="3.5" y="13" width="7.5" height="7.5" rx="1.5" />
      <rect x="13" y="13" width="7.5" height="7.5" rx="1.5" />
    </svg>
  )
}

export function MoveIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 2v20M2 12h20M5 9l-3 3 3 3M19 9l3 3-3 3M9 5l3-3 3 3M9 19l3 3 3-3" />
    </svg>
  )
}

export function UsersIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5" />
      <path d="M16 4.3c1.6.4 2.8 1.9 2.8 3.7 0 1.8-1.2 3.3-2.8 3.7M19 13.8c2.3.6 4 2.6 4 5" />
    </svg>
  )
}

export function ReturnIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 10h11a5 5 0 0 1 0 10h-2" />
      <path d="m8 5-4 5 4 5" />
    </svg>
  )
}

export function GiftIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M12 8v13M19 12v7a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-7" />
      <path d="M12 8c-1.5-3-3.5-5-5.5-4S5 7 8 8h4ZM12 8c1.5-3 3.5-5 5.5-4S19 7 16 8h-4Z" />
    </svg>
  )
}

export function DropletIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3s-7 7.5-7 12a7 7 0 0 0 14 0c0-4.5-7-12-7-12Z" />
    </svg>
  )
}

export function WhatsappIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="currentColor" {...props}>
      <path d="M12.02 2C6.5 2 2 6.48 2 12c0 1.9.53 3.68 1.44 5.2L2 22l4.94-1.4A9.96 9.96 0 0 0 12.02 22C17.55 22 22 17.52 22 12S17.55 2 12.02 2Zm5.8 14.2c-.24.68-1.4 1.3-1.94 1.38-.5.08-1.12.11-1.8-.11-.42-.13-.96-.31-1.65-.6-2.9-1.25-4.8-4.17-4.94-4.36-.14-.2-1.18-1.57-1.18-3 0-1.42.75-2.12 1.02-2.41.27-.29.58-.36.78-.36h.56c.18 0 .42-.07.65.5.24.58.82 2 .9 2.14.07.14.12.31.02.5-.1.2-.15.32-.3.5-.14.17-.3.38-.43.51-.14.14-.29.29-.13.57.17.29.75 1.24 1.61 2 1.11.99 2.04 1.3 2.33 1.44.29.14.46.12.63-.07.17-.2.72-.84.92-1.13.19-.29.38-.24.64-.14.27.1 1.68.79 1.97.94.29.14.48.21.55.33.07.13.07.72-.17 1.4Z" />
    </svg>
  )
}

export function ScissorsIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M20 4 8.5 12M8.5 12 20 20M8.5 12 6 12" />
    </svg>
  )
}

export function CartIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="9" cy="20" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="18" cy="20" r="1.4" fill="currentColor" stroke="none" />
      <path d="M3 4h2l2.4 11.5a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.6L21 8H6" />
    </svg>
  )
}

export function ArrowUpIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  )
}

export function ArrowLeftIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  )
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  )
}

export function ChartIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 20V10M12 20V4M20 20v-7" />
    </svg>
  )
}

export function CashIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="3" />
      <path d="M6 6v0M18 18v0" />
    </svg>
  )
}

export function CardIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
      <path d="M6 15h4" />
    </svg>
  )
}

export function PrinterIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 9V3h12v6" />
      <rect x="4" y="9" width="16" height="8" rx="1.5" />
      <path d="M6 14h12v7H6z" />
    </svg>
  )
}

export function FlameIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 2.5c1.2 2.2-1.6 3.6-1.6 6 0 1.5 1.2 2.5 2.5 2.5.9 0 1.6-.5 2-1.2.6 1 1 2.1 1 3.2 0 3.3-2.7 6-6 6s-6-2.7-6-6c0-4 3-5.6 4.6-8 .5.9.4 1.9-.1 2.7.9-1 1.3-2.7.6-5.2z" />
    </svg>
  )
}

export function WarningIcon({ fill, ...props }: IconProps) {
  // Passing fill (e.g. fill="currentColor") gives a "solid" triangle with
  // the exclamation mark cut out in white — default (no fill) stays the
  // plain outline used everywhere else (NotificationsBell, etc).
  const filled = !!fill && fill !== 'none'
  return (
    <svg {...base} {...props} fill={fill ?? 'none'}>
      <path d="M12 3.5 22 20.5H2z" fill={filled ? 'currentColor' : 'none'} stroke={filled ? 'none' : 'currentColor'} />
      <path d="M12 9.5v5" stroke={filled ? 'white' : 'currentColor'} />
      <path d="M12 17.5v0" stroke={filled ? 'white' : 'currentColor'} />
    </svg>
  )
}

export function NoStockIcon({ fill, ...props }: IconProps) {
  const filled = !!fill && fill !== 'none'
  return (
    <svg {...base} {...props} fill={fill ?? 'none'}>
      <circle cx="12" cy="12" r="9" fill={filled ? 'currentColor' : 'none'} stroke={filled ? 'none' : 'currentColor'} />
      <path d="M6.5 6.5l11 11" stroke={filled ? 'white' : 'currentColor'} />
    </svg>
  )
}

export function TransferIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 8h13" />
      <path d="M13 4l4 4-4 4" />
      <path d="M20 16H7" />
      <path d="M11 12l-4 4 4 4" />
    </svg>
  )
}

export function BellIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M18 16v-5a6 6 0 1 0-12 0v5l-2 3h16z" />
      <path d="M10 21a2 2 0 0 0 4 0" />
    </svg>
  )
}
