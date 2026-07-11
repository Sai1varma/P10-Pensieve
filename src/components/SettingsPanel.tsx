import { useState } from "react";
import { loadSettings, saveSettings, PROVIDER_LABELS, type AppSettings, type ProviderId } from "../board/settings";

const PROVIDER_ORDER: ProviderId[] = ["openai", "deepseek", "groq", "mistral", "xai", "gemini"];

/** App-level preferences (separate from board content): Present mode's
 *  default traversal order, and AI provider/model for the Expand-idea
 *  action (BlockNode.tsx). No API key field here -- keys live server-side
 *  in the Edge Function, never the browser. */
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

        <p className="palette-heading" style={{ marginTop: 14 }}>
          AI (Expand idea)
        </p>
        <select
          className="filter-select"
          style={{ width: "100%", marginBottom: 8 }}
          value={settings.aiProvider ?? ""}
          onChange={(e) => update({ aiProvider: (e.target.value || null) as ProviderId | null })}
        >
          <option value="">Not configured</option>
          {PROVIDER_ORDER.map((p) => (
            <option key={p} value={p}>
              {PROVIDER_LABELS[p]}
            </option>
          ))}
        </select>
        <input
          className="detail-input modal-input"
          placeholder="Model id, e.g. deepseek-chat"
          value={settings.aiModel}
          onChange={(e) => update({ aiModel: e.target.value })}
          disabled={!settings.aiProvider}
        />
        <p className="modal-body" style={{ marginTop: 8 }}>
          Only picks which provider/model the "✨ Expand" node action uses — the actual API key is
          configured server-side and never touches your browser.
        </p>
      </div>
    </div>
  );
}
