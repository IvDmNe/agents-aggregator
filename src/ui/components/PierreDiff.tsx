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

/**
 * Thin wrapper around `@pierre/diffs`' MultiFileDiff. Pierre owns the markup
 * inside a Shadow DOM (custom element), so our theme tokens don't cascade in —
 * we pick its built-in `pierre-light` / `pierre-dark` themes to match mode.
 */
export function PierreDiff({
  theme, oldText, newText, path, diffStyle = 'unified',
  maxHeight = 320, disableFileHeader = true,
}: PierreDiffProps) {
  const name = path && path.length > 0 ? path : 'file';
  return (
    <div style={{
      overflow: 'auto',
      maxHeight: maxHeight === 'none' ? undefined : maxHeight,
      fontFamily: monoFont,
    }}>
      <MultiFileDiff
        oldFile={{ name, contents: oldText }}
        newFile={{ name, contents: newText }}
        options={{
          themeType: theme,
          theme: { light: 'pierre-light', dark: 'pierre-dark' },
          diffStyle,
          disableFileHeader,
        }}
      />
    </div>
  );
}
