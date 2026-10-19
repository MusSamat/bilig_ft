/**
 * Binary downloads from contract endpoints (КТП lesson plans, the topic's
 * ready-made presentation): read the body as a Blob, take the file name from
 * `Content-Disposition`, and hand it to the browser as a file.
 */

/** Server file name from Content-Disposition (`filename*=UTF-8''…` preferred). */
export function filenameFromDisposition(cd: string | null): string | null {
  if (!cd) return null;
  const star = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(cd);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''));
    } catch {
      /* fall through to the plain name */
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/.exec(cd);
  return plain ? plain[1].trim() : null;
}

export interface Download {
  blob: Blob;
  filename: string;
}

/** Response → Blob + server file name (`fallback` when the header has none). */
export async function readDownload(res: Response, fallback: string): Promise<Download> {
  const blob = await res.blob();
  return { blob, filename: filenameFromDisposition(res.headers.get('Content-Disposition')) ?? fallback };
}

/** Hand a blob to the browser as a file download. */
export function saveFile({ blob, filename }: Download): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
