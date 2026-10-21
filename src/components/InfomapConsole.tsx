import { Button, Modal, ProgressBar } from "@heroui/react";
import { observer } from "mobx-react-lite";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useStores } from "../stores";
import { CONSOLE_MAX_LINES } from "../stores/ui-store";

/** Trial progress for multi-trial runs, indeterminate otherwise. */
export const InfomapProgressBar = observer(function InfomapProgressBar({
  size,
}: {
  size?: "sm" | "md";
}) {
  const { ui } = useStores();
  const progress = ui.infomapProgress;
  return (
    <ProgressBar
      size={size}
      aria-label="Infomap progress"
      isIndeterminate={progress === null}
      value={progress ?? undefined}
    >
      <ProgressBar.Track>
        <ProgressBar.Fill />
      </ProgressBar.Track>
    </ProgressBar>
  );
});

/** Opens the console; shown once an Infomap run has started. */
export const ConsoleButton = observer(function ConsoleButton() {
  const { ui } = useStores();
  if (ui.infomapCommand === null) return null;
  return (
    <Button
      size="sm"
      variant="secondary"
      onPress={() => ui.setConsoleOpen(true)}
    >
      Console
    </Button>
  );
});

const ConsoleBody = observer(function ConsoleBody() {
  const { ui } = useStores();
  const output = ui.infomapOutput;
  const text = useMemo(() => output.join("\n"), [output]);
  const preRef = useRef<HTMLPreElement>(null);
  // Follow new output until the user scrolls up; scrolling back down resumes.
  const follow = useRef(true);
  const [copied, setCopied] = useState<"ok" | "failed" | null>(null);

  useLayoutEffect(() => {
    const el = preRef.current;
    if (el && follow.current && text) el.scrollTop = el.scrollHeight;
  }, [text]);

  const dropped =
    ui.infomapDroppedLines > 0
      ? `Showing the last ${CONSOLE_MAX_LINES.toLocaleString()} lines; ${ui.infomapDroppedLines.toLocaleString()} earlier lines were dropped.`
      : null;

  const copy = async (): Promise<void> => {
    const parts = [`$ ${ui.infomapCommand ?? ""}`];
    if (dropped) parts.push(`[${dropped}]`);
    parts.push(text);
    if (ui.infomapFailure) parts.push(`Error: ${ui.infomapFailure}`);
    try {
      await navigator.clipboard.writeText(parts.join("\n"));
      setCopied("ok");
    } catch {
      setCopied("failed");
    }
    setTimeout(() => setCopied(null), 1500);
  };

  const status = ui.infomapRunning
    ? "Running…"
    : ui.infomapFailure
      ? "Failed"
      : "Finished";

  return (
    <>
      <Modal.Body className="flex min-h-0 flex-col gap-2">
        <div className="flex items-baseline gap-2 text-xs">
          <code className="min-w-0 flex-1 break-all text-neutral-600">
            {ui.infomapCommand}
          </code>
          <span
            className={`shrink-0 ${ui.infomapFailure ? "text-red-600" : "text-neutral-400"}`}
          >
            {status}
          </span>
        </div>
        {dropped && <p className="text-[11px] text-neutral-400">{dropped}</p>}
        {/* Focusable so the keyboard can scroll it; not live, as a run
            prints thousands of lines. */}
        <pre
          ref={preRef}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region
          tabIndex={0}
          role="log"
          aria-live="off"
          aria-label="Infomap output"
          onScroll={(e) => {
            const el = e.currentTarget;
            follow.current =
              el.scrollHeight - el.scrollTop - el.clientHeight < 24;
          }}
          className="h-[60vh] overflow-auto rounded-md bg-neutral-900 p-3 font-mono text-[11px] leading-snug text-neutral-100"
        >
          {text || (
            <span className="text-neutral-500">
              {ui.infomapRunning ? "Waiting for output…" : "No output."}
            </span>
          )}
          {ui.infomapFailure && (
            <span className="block pt-2 text-red-400">
              Error: {ui.infomapFailure}
            </span>
          )}
        </pre>
      </Modal.Body>
      <Modal.Footer>
        <Button size="sm" variant="secondary" onPress={copy}>
          {copied === "ok"
            ? "Copied"
            : copied === "failed"
              ? "Copy failed"
              : "Copy"}
        </Button>
      </Modal.Footer>
    </>
  );
});

/** The last Infomap run's command line and stdout (sidebar or load dialog). */
export const InfomapConsole = observer(function InfomapConsole() {
  const { ui } = useStores();
  return (
    <Modal.Backdrop isOpen={ui.consoleOpen} onOpenChange={ui.setConsoleOpen}>
      <Modal.Container size="lg">
        <Modal.Dialog className="max-w-3xl">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>Infomap console</Modal.Heading>
          </Modal.Header>
          <ConsoleBody />
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
});
