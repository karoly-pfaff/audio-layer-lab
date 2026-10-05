import { useRef } from 'react';
import { useAudioLabStore } from '../store/useAudioLabStore';

export function PresetControls() {
  const { exportPreset, importPreset, resetSession } = useAudioLabStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (
      file &&
      window.confirm(
        'Importing a preset replaces the current mix and snapshots. Unreferenced local audio may be removed. Continue?',
      )
    ) {
      importPreset(file);
    }
    e.target.value = '';
  }

  return (
    <div className="preset-controls">
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="preset-file-input"
        onChange={handleFileChange}
        aria-hidden="true"
        tabIndex={-1}
      />
      <button
        className="preset-btn"
        onClick={handleImportClick}
        type="button"
        title="Import a preset JSON file"
      >
        Import preset
      </button>
      <button
        className="preset-btn"
        onClick={exportPreset}
        type="button"
        title="Export current session as preset JSON"
      >
        Export preset
      </button>
      <button
        className="preset-btn preset-btn--reset"
        onClick={() => {
          if (
            window.confirm(
              'Reset the complete session? This clears the mix, snapshots, A/B slots, and unreferenced locally stored audio.',
            )
          ) {
            resetSession();
          }
        }}
        type="button"
        title="Reset the mix, snapshots, A/B slots, and remembered audio"
      >
        Reset session
      </button>
    </div>
  );
}
