export interface LyricLine {
  time: number;
  text: string;
}

/** Parse timestamped LRC lyrics, preserving multiple lines at the same time. */
export function parseLrcLyrics(lrcText: string): LyricLine[] {
  const lines: LyricLine[] = [];
  const lrcRegex = /\[(\d{1,2}):(\d{2})(?:\.(\d{2,3}))?\](.*)/g;
  let match: RegExpExecArray | null;

  while ((match = lrcRegex.exec(lrcText)) !== null) {
    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    const milliseconds = match[3] ? parseInt(match[3].padEnd(3, "0"), 10) : 0;
    lines.push({ time: (minutes * 60 + seconds) * 1000 + milliseconds, text: match[4].trim() });
  }

  return lines.sort((a, b) => a.time - b.time);
}

export function activeLyricIndex(lines: LyricLine[], positionMs: number): number {
  for (let index = lines.length - 1; index >= 0; index--) {
    if (positionMs >= lines[index].time) return index;
  }
  return -1;
}
