import { describe, expect, it } from 'vitest';
import { persistableUrl } from './urlUtils';

describe('persistableUrl', () => {
  it('allows only bounded, embedded raster image URLs', () => {
    expect(persistableUrl('https://example.com/image.png')).toBeNull();
    expect(persistableUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
    expect(persistableUrl('data:image/svg+xml;base64,AAAA')).toBeNull();
    expect(persistableUrl(`data:image/png;base64,${'A'.repeat(2_000_000)}`)).toBeNull();
  });

  it('rejects transient and executable URL schemes', () => {
    expect(persistableUrl('blob:http://localhost/image')).toBeNull();
    expect(persistableUrl('javascript:alert(1)')).toBeNull();
    expect(persistableUrl('data:text/html,<script>')).toBeNull();
  });
});
