import { useAudioLabStore } from '../store/useAudioLabStore';

export function StatusMessage() {
  const { statusMessage, dismissStatus } = useAudioLabStore();

  if (!statusMessage) {
    return null;
  }

  return (
    <div className="status-toast">
      <span role="status" aria-live="polite" aria-atomic="true">
        {statusMessage}
      </span>
      <button
        className="status-toast-close"
        type="button"
        onClick={dismissStatus}
        aria-label="Dismiss notification"
      >
        ✕
      </button>
    </div>
  );
}
