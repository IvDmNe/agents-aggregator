interface PinGlyphProps {
  filled: boolean;
  size?: number;
  color?: string;
}

export function PinGlyph({ filled, size = 12, color = 'currentColor' }: PinGlyphProps) {
  if (filled) {
    return (
      <svg viewBox="0 0 16 16" width={size} height={size} fill={color} aria-hidden>
        <path d="M8.5 1.5l-1 1 .5.5-3 3-1.5-.5-.5 1 3 3-3.5 4.5L3 14l4.5-3.5 3 3 1-.5-.5-1.5 3-3 .5.5 1-1L8.5 1.5z"/>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="none" stroke={color} strokeWidth={1.3} strokeLinejoin="round" aria-hidden>
      <path d="M8.5 1.8l-.7.7.5.5-3 3-1.5-.5-.4.8 3 3-3 4 .3.3 4-3 3 3 .8-.4-.5-1.5 3-3 .5.5.7-.7L8.5 1.8z"/>
    </svg>
  );
}
