import { memo, useMemo } from 'react';
import { MultiFileDiff } from '@pierre/diffs/react';
import { monoFont, type ThemeMode } from '../theme';

interface PierreDiffProps {
  theme: ThemeMode;
  oldText: string;
  newText: string;
  /** Filename used by Shiki to pick a syntax-highlighting grammar. */
  path?: string;
  /** Split (side-by-side) or unified (stacked) layout. Defaults to unified. */
  diffStyle?: 'unified' | 'split';
  /** Scroll viewport cap; pass `'none'` to let it grow. */
  maxHeight?: number | string;
  /** Skip the file-name header — we usually render our own. */
  disableFileHeader?: boolean;
}

// Pierre's MultiFileDiff memoizes parseDiffFromFile on oldFile/newFile reference
// equality and re-tokenizes via Shiki when options change — stabilize all three
// objects so unrelated parent re-renders don't re-tokenize the diff.
function PierreDiffImpl({
  theme, oldText, newText, path, diffStyle = 'unified',
  maxHeight = 320, disableFileHeader = true,
}: PierreDiffProps) {
  const name = path && path.length > 0 ? path : 'file';
  const oldFile = useMemo(() => ({ name, contents: oldText }), [name, oldText]);
  const newFile = useMemo(() => ({ name, contents: newText }), [name, newText]);
  const options = useMemo(() => ({
    themeType: theme,
    theme: { light: 'pierre-light' as const, dark: 'pierre-dark' as const },
    diffStyle,
    disableFileHeader,
  }), [theme, diffStyle, disableFileHeader]);

  const wrapStyle = useMemo(() => ({
    overflow: 'auto' as const,
    maxHeight: maxHeight === 'none' ? undefined : maxHeight,
    fontFamily: monoFont,
  }), [maxHeight]);

  return (
    <div style={wrapStyle}>
      <MultiFileDiff oldFile={oldFile} newFile={newFile} options={options} />
    </div>
  );
}

export const PierreDiff = memo(PierreDiffImpl);
