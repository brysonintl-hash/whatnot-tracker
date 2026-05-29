const overrides = new Map<string, string>();

export function getPasswordOverride(username: string): string | undefined {
  return overrides.get(username);
}

export function setPasswordOverride(username: string, password: string): void {
  overrides.set(username, password);
}
