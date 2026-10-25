export const PASSWORD_CHECKS = [
  // Labels are translated at render time (PasswordChecklist, common:password.checks.*).
  { key: 'length' },
  { key: 'uppercase' },
  { key: 'lowercase' },
  { key: 'digit' },
] as const;

export type PasswordCheckKey = (typeof PASSWORD_CHECKS)[number]['key'];
export type PasswordCheckResult = Record<PasswordCheckKey, boolean>;

export function computePasswordChecks(password: string): PasswordCheckResult {
  return {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    digit: /\d/.test(password),
  };
}

export function allChecksPassing(checks: PasswordCheckResult): boolean {
  return Object.values(checks).every(Boolean);
}
