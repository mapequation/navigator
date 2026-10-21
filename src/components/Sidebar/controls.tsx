import { Switch, ToggleButton, ToggleButtonGroup } from "@heroui/react";
import { Fragment, type ReactNode } from "react";

/** Collapsible sidebar section (native <details>: keyboard + a11y for free). */
export function Section({
  title,
  aside,
  defaultOpen = true,
  children,
}: {
  title: string;
  /** Short summary shown next to the title (visible when collapsed too). */
  aside?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="group border-t border-neutral-200 px-4 py-3"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 select-none [&::-webkit-details-marker]:hidden">
        <svg
          viewBox="0 0 16 16"
          aria-hidden="true"
          className="h-3 w-3 shrink-0 text-neutral-400 transition-transform group-open:rotate-90"
        >
          <path
            d="M6 4l4 4-4 4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
        </svg>
        <h2 className="text-xs font-semibold tracking-wide text-neutral-600 uppercase">
          {title}
        </h2>
        {aside && (
          <span className="ml-auto truncate text-xs text-neutral-400">
            {aside}
          </span>
        )}
      </summary>
      <div className="mt-3 flex flex-col gap-2.5">{children}</div>
    </details>
  );
}

/** Sub-heading inside a section. */
export function Group({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-[11px] font-medium text-neutral-400">{title}</h3>
      {children}
    </div>
  );
}

// Row is a plain layout row, not a <label>: Switch/Select render their own
// label structure, so wrapping them would nest labels. Controls carry their
// own aria-label instead.
export function Row({
  label,
  hint,
  children,
}: {
  label: ReactNode;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-7 items-center justify-between gap-3">
      <span className="text-xs text-neutral-700" title={hint}>
        {label}
      </span>
      {children}
    </div>
  );
}

/** Two-column label/value grid for read-only facts. */
export function Stats({ rows }: { rows: [string, ReactNode, string?][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
      {rows.map(([label, value, title]) => (
        <Fragment key={label}>
          <dt className="text-neutral-500">{label}</dt>
          <dd
            className="truncate text-right font-medium tabular-nums text-neutral-800"
            title={title}
          >
            {value}
          </dd>
        </Fragment>
      ))}
    </dl>
  );
}

/** Single-choice segmented control: every option is one click away. */
export function Segmented<K extends string>({
  label,
  value,
  options,
  onChange,
  isDisabled,
}: {
  label: string;
  value: K;
  options: readonly (K | readonly [K, string])[];
  onChange: (value: K) => void;
  isDisabled?: boolean;
}) {
  return (
    <ToggleButtonGroup
      aria-label={label}
      size="sm"
      selectionMode="single"
      disallowEmptySelection
      isDisabled={isDisabled}
      selectedKeys={[value]}
      onSelectionChange={(keys) => {
        const [k] = keys;
        if (k !== undefined && k !== value) onChange(k as K);
      }}
    >
      {options.map((o) => {
        const [id, text] = typeof o === "string" ? [o, o] : o;
        return (
          <ToggleButton key={id} id={id} className="px-2 text-xs">
            {text}
          </ToggleButton>
        );
      })}
    </ToggleButtonGroup>
  );
}

export function Toggle({
  label,
  isSelected,
  onChange,
  isDisabled,
}: {
  label: string;
  isSelected: boolean;
  onChange: (on: boolean) => void;
  isDisabled?: boolean;
}) {
  return (
    <Switch
      size="sm"
      aria-label={label}
      isSelected={isSelected}
      isDisabled={isDisabled}
      onChange={onChange}
    >
      <Switch.Content>
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
      </Switch.Content>
    </Switch>
  );
}
