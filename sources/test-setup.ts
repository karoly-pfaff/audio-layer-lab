import '@testing-library/jest-dom/vitest';

// jsdom does not implement URL.createObjectURL / revokeObjectURL; stub them
if (typeof URL.createObjectURL === 'undefined') {
  URL.createObjectURL = () => 'blob:http://localhost/test-object-url';
}
if (typeof URL.revokeObjectURL === 'undefined') {
  URL.revokeObjectURL = () => {};
}
