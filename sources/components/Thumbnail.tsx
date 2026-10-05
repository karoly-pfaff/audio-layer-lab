import { useState } from 'react';

interface ThumbnailProps {
  url: string | null;
  size?: number;
}

export function Thumbnail({ url, size = 56 }: ThumbnailProps) {
  const [storedState, setStoredState] = useState({ url, loaded: false, errored: false });
  const imageState = storedState.url === url ? storedState : { url, loaded: false, errored: false };

  return (
    <div className="thumbnail-wrap" style={{ width: size, height: size, flexShrink: 0 }}>
      {url && !imageState.errored ? (
        <>
          {!imageState.loaded && (
            <div className="thumbnail-skeleton" style={{ width: size, height: size }} />
          )}
          <img
            src={url}
            alt=""
            width={size}
            height={size}
            className={`thumbnail-img${imageState.loaded ? ' thumbnail-img--loaded' : ''}`}
            onLoad={() => setStoredState({ url, loaded: true, errored: false })}
            onError={() => setStoredState({ url, loaded: false, errored: true })}
          />
        </>
      ) : (
        <div
          className="thumbnail-placeholder"
          style={{ width: size, height: size }}
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 19V6l12-3v13M9 19c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm12-3c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2z" />
          </svg>
        </div>
      )}
    </div>
  );
}
