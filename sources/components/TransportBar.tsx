import { PresetControls } from './PresetControls';
import { KeyboardHelp } from './KeyboardHelp';

export function TransportBar() {
  return (
    <header className="transport-bar">
      <div className="transport-brand">
        <div className="transport-brand-icon">
          <svg width="18" height="16" viewBox="0 0 18 16" fill="none" aria-hidden="true">
            <rect x="0" y="7" width="2" height="2" rx="1" fill="currentColor" opacity="0.4" />
            <rect x="3" y="4" width="2" height="8" rx="1" fill="currentColor" opacity="0.65" />
            <rect x="6" y="1" width="2" height="14" rx="1" fill="currentColor" />
            <rect x="9" y="3" width="2" height="10" rx="1" fill="currentColor" opacity="0.75" />
            <rect x="12" y="5" width="2" height="6" rx="1" fill="currentColor" opacity="0.55" />
            <rect x="15" y="7" width="2" height="2" rx="1" fill="currentColor" opacity="0.35" />
          </svg>
        </div>
        <h1 className="transport-brand-name">Audio Layer Lab</h1>
        <span className="transport-brand-version">v{__APP_VERSION__}</span>
      </div>
      <PresetControls />
      <KeyboardHelp />
    </header>
  );
}
