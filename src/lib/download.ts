function click(href: string, filename: string, revoke = false): void {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (revoke) URL.revokeObjectURL(href);
}

export function downloadText(
  filename: string,
  text: string,
  mime = "text/plain;charset=utf-8",
): void {
  click(URL.createObjectURL(new Blob([text], { type: mime })), filename, true);
}

export function downloadDataUrl(filename: string, dataUrl: string): void {
  click(dataUrl, filename);
}
