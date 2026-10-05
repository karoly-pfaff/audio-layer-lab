const INTERACTIVE_SELECTOR = [
  'input',
  'button',
  'select',
  'textarea',
  'a[href]',
  '[contenteditable="true"]',
  '[role="slider"]',
  '[role="spinbutton"]',
].join(',');

export function isInteractiveShortcutTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(INTERACTIVE_SELECTOR) !== null;
}
