import { SWATCHES } from "../board/types";

export function ColorPalette({
  value,
  onPick,
  onClose,
}: {
  value: string | null;
  onPick: (color: string | null) => void;
  onClose: () => void;
}) {
  return (
    <div className="palette" role="menu" onMouseLeave={onClose}>
      <button
        className="swatch swatch-none"
        title="No color"
        role="menuitem"
        aria-pressed={value === null}
        onClick={() => {
          onPick(null);
          onClose();
        }}
      >
        ⌀
      </button>
      {SWATCHES.map((c) => (
        <button
          key={c}
          className="swatch"
          style={{ background: c }}
          title={c}
          role="menuitem"
          aria-pressed={value === c}
          onClick={() => {
            onPick(c);
            onClose();
          }}
        />
      ))}
      <label className="swatch swatch-custom" title="Custom color">
        <input
          type="color"
          value={value ?? "#4f8cff"}
          onChange={(e) => onPick(e.target.value)}
        />
      </label>
    </div>
  );
}
