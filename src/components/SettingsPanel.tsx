import { useState } from "react";
import { loadSettings, saveSettings, type AppSettings } from "../board/settings";

/** App-level preferences (separate from board content). Currently just
 *  Present mode's default traversal order; structured to grow (e.g. AI
 *  model config) without restructuring. */
export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [settings, setSettingsState] = useState<AppSettings>(loadSettings);

  const update = (patch: Partial<AppSettings>) => setSettingsState(saveSettings(patch));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-label="Settings" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} title="Close">
          ×
        </button>
        <h2 className="modal-title">Settings</h2>

        <p className="palette-heading">Present mode default</p>
        <div className="template-picker" role="radiogroup" aria-label="Default presentation order">
          <button
            type="button"
            className="template-option"
            role="radio"
            aria-checked={settings.presentMode === "depth"}
            onClick={() => update({ presentMode: "depth" })}
          >
            <span className="template-option-label">Depth-first</span>
            <span className="template-option-desc">Drill into each branch fully before the next pillar.</span>
          </button>
          <button
            type="button"
            className="template-option"
            role="radio"
            aria-checked={settings.presentMode === "breadth"}
            onClick={() => update({ presentMode: "breadth" })}
          >
            <span className="template-option-label">Breadth-first</span>
            <span className="template-option-desc">Show a whole level before going deeper.</span>
          </button>
        </div>
        <p className="modal-body" style={{ marginTop: 10 }}>
          You can still switch for a single presentation from Present mode's own toggle — this only
          changes what it starts with.
        </p>
      </div>
    </div>
  );
}
