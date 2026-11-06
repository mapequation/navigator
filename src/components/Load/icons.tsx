/** Small stroke icons for the load dialog, drawn in currentColor. */
type IconProps = { className?: string };

function Icon({
  className = "h-4 w-4",
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export const SparkIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3M3.4 3.4l2.1 2.1M10.5 10.5l2.1 2.1M3.4 12.6l2.1-2.1M10.5 5.5l2.1-2.1" />
  </Icon>
);

export const CatalogIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="4" cy="4" r="1.75" />
    <circle cx="12" cy="5" r="1.75" />
    <circle cx="6" cy="12" r="1.75" />
    <path d="M5.7 4.3l4.6.5M4.6 5.7l.9 4.6M10.8 6.3l-3.6 4.4" />
  </Icon>
);

export const FileIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9.5 1.5H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5z" />
    <path d="M9.5 1.5V5H13" />
  </Icon>
);

export const UploadIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 10.5V2M4.5 5.5 8 2l3.5 3.5M2.5 10.5v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2" />
  </Icon>
);

export const ExternalIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5M12 9.5v3a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3" />
  </Icon>
);

export const ArrowIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 8h10M9 4l4 4-4 4" />
  </Icon>
);

export const SortIcon = ({
  descending,
  ...p
}: IconProps & { descending: boolean }) => (
  <Icon {...p}>
    {descending ? (
      <path d="M8 2.5v11M4.5 10 8 13.5 11.5 10" />
    ) : (
      <path d="M8 13.5v-11M4.5 6 8 2.5 11.5 6" />
    )}
  </Icon>
);

export const CloudIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 12.5a3 3 0 0 1-.4-6 4 4 0 0 1 7.7-.9 3.5 3.5 0 0 1-.3 6.9z" />
  </Icon>
);

export const InfoIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="6.25" />
    <path d="M8 7.25v3.75M8 5h.01" />
  </Icon>
);
