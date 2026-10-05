export function persistableUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }
  const trimmed = url.trim();
  if (
    trimmed.length <= 2_000_000 &&
    /^data:image\/(?:png|jpeg|gif|webp);base64,[a-z\d+/=\s]+$/i.test(trimmed)
  ) {
    return trimmed;
  }
  return null;
}
