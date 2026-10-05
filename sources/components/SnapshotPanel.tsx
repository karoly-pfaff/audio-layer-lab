import { useState, useRef, useEffect } from 'react';
import { useAudioLabStore } from '../store/useAudioLabStore';

export function SnapshotPanel() {
  const {
    snapshots,
    ab,
    saveSnapshot,
    applySnapshot,
    renameSnapshot,
    duplicateSnapshot,
    deleteSnapshot,
    assignAB,
    applyAB,
  } = useAudioLabStore();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId) {
      inputRef.current?.focus();
    }
  }, [editingId]);

  function startRename(id: string, currentName: string) {
    setEditingId(id);
    setEditingName(currentName);
  }

  function commitRename(id: string) {
    renameSnapshot(id, editingName);
    setEditingId(null);
  }

  function handleRenameKey(e: React.KeyboardEvent, id: string) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitRename(id);
    }
    if (e.key === 'Escape') {
      setEditingId(null);
    }
  }

  return (
    <section className="snapshot-panel" aria-labelledby="snapshots-heading">
      <div className="snapshot-toolbar">
        <h2 id="snapshots-heading" className="panel-label">
          Snapshots
        </h2>
        <button
          className="snapshot-btn"
          onClick={() => saveSnapshot()}
          type="button"
          title="Save current mix as a snapshot"
          aria-label="Save current mix as a snapshot"
        >
          Save
        </button>
        <span className="snapshot-toolbar-sep" aria-hidden="true" />
        <button
          className={`snapshot-btn snapshot-btn--ab${ab.a ? ' snapshot-btn--ab-set' : ''}`}
          onClick={() => assignAB('a')}
          type="button"
          title="Assign current mix to A"
          aria-label="Assign current mix to comparison slot A"
        >
          →A
        </button>
        <button
          className={`snapshot-btn snapshot-btn--ab${ab.b ? ' snapshot-btn--ab-set' : ''}`}
          onClick={() => assignAB('b')}
          type="button"
          title="Assign current mix to B"
          aria-label="Assign current mix to comparison slot B"
        >
          →B
        </button>
        <button
          className={`snapshot-btn snapshot-btn--compare${ab.a ? ' snapshot-btn--compare-active' : ''}`}
          onClick={() => applyAB('a')}
          type="button"
          title={ab.a ? 'Apply A mix' : 'A slot is empty — assign first with →A'}
          disabled={!ab.a}
          aria-label="Apply comparison mix A"
        >
          A
        </button>
        <button
          className={`snapshot-btn snapshot-btn--compare${ab.b ? ' snapshot-btn--compare-active' : ''}`}
          onClick={() => applyAB('b')}
          type="button"
          title={ab.b ? 'Apply B mix' : 'B slot is empty — assign first with →B'}
          disabled={!ab.b}
          aria-label="Apply comparison mix B"
        >
          B
        </button>
      </div>

      {snapshots.length > 0 && (
        <div className="snapshot-list">
          {snapshots.map((snap) => (
            <div
              key={snap.id}
              className="snapshot-row"
              role="group"
              aria-label={`Snapshot: ${snap.name}`}
            >
              {editingId === snap.id ? (
                <input
                  ref={inputRef}
                  className="snapshot-rename-input"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value.slice(0, 40))}
                  onBlur={() => commitRename(snap.id)}
                  onKeyDown={(e) => handleRenameKey(e, snap.id)}
                  aria-label={`Rename snapshot ${snap.name}`}
                />
              ) : (
                <span
                  className="snapshot-name"
                  title={snap.name}
                  onDoubleClick={() => startRename(snap.id, snap.name)}
                >
                  {snap.name}
                </span>
              )}
              <div className="snapshot-row-actions">
                <button
                  className="snapshot-action-btn"
                  onClick={() => applySnapshot(snap.id)}
                  type="button"
                  title="Apply snapshot"
                  aria-label={`Apply snapshot ${snap.name}`}
                >
                  ▶
                </button>
                <button
                  className="snapshot-action-btn"
                  onClick={() => startRename(snap.id, snap.name)}
                  type="button"
                  title="Rename"
                  aria-label={`Rename snapshot ${snap.name}`}
                >
                  ✎
                </button>
                <button
                  className="snapshot-action-btn"
                  onClick={() => duplicateSnapshot(snap.id)}
                  type="button"
                  title="Duplicate"
                  aria-label={`Duplicate snapshot ${snap.name}`}
                >
                  ⊕
                </button>
                <button
                  className="snapshot-action-btn snapshot-action-btn--delete"
                  onClick={() => deleteSnapshot(snap.id)}
                  type="button"
                  title="Delete"
                  aria-label={`Delete snapshot ${snap.name}`}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
