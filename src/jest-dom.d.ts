import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

// Vitest 5 changed Assertion<T> to Assertion<R, T>, so the augmentation that
// ships with @testing-library/jest-dom 7 no longer merges. Extend Matchers<R, T>,
// Vitest's supported extension point, instead.
declare module 'vitest' {
  interface Matchers<R, T> extends TestingLibraryMatchers<unknown, R> {}
}
