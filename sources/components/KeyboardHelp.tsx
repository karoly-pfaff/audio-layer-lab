import { useEffect, useRef, useState } from 'react';

const SHORTCUTS = [
  { key: 'Space', action: 'Play / Pause' },
  { key: 'Esc', action: 'Stop' },
  { key: 'Home', action: 'Restart from start' },
  { key: '← / →', action: 'Jump ±5 seconds' },
  { key: 'M', action: 'Master mute toggle' },
  { key: '↑ / ↓', action: 'Move focused layer up / down' },
  { key: 'Home / End', action: 'Move focused layer to first / last' },
];

export function KeyboardHelp() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const trigger = triggerRef.current;
    closeRef.current?.focus();

    function handleDialogKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        setOpen(false);
      } else if (event.key === 'Tab') {
        event.preventDefault();
        closeRef.current?.focus();
      }
    }

    window.addEventListener('keydown', handleDialogKey, true);
    return () => {
      window.removeEventListener('keydown', handleDialogKey, true);
      trigger?.focus();
    };
  }, [open]);

  return (
    <div className="kb-help">
      <button
        ref={triggerRef}
        className={`kb-help-btn${open ? ' kb-help-btn--active' : ''}`}
        onClick={() => setOpen((o) => !o)}
        type="button"
        title="Keyboard shortcuts"
        aria-label="Keyboard shortcuts"
        aria-expanded={open}
        aria-controls="keyboard-shortcuts-dialog"
      >
        ?
      </button>
      {open && (
        <>
          <div className="kb-help-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            id="keyboard-shortcuts-dialog"
            className="kb-help-popover"
            role="dialog"
            aria-modal="true"
            aria-labelledby="keyboard-shortcuts-title"
          >
            <div className="kb-help-header">
              <h2 id="keyboard-shortcuts-title" className="kb-help-title">
                Keyboard shortcuts
              </h2>
              <button
                ref={closeRef}
                className="kb-help-close"
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close keyboard shortcuts"
              >
                ✕
              </button>
            </div>
            <table className="kb-help-table">
              <caption className="visually-hidden">Available keyboard shortcuts</caption>
              <tbody>
                {SHORTCUTS.map(({ key, action }) => (
                  <tr key={key}>
                    <th scope="row" className="kb-help-key">
                      <kbd>{key}</kbd>
                    </th>
                    <td className="kb-help-action">{action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
