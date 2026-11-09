import { describe, expect, it } from 'vitest';
import { cleanName, hashPassword, normalEmail, readCookie, sessionCookie, sha256, validEmail, validPassword, verifyPassword } from '../src/auth';

describe('passwords', () => {
  it('hash with a fresh salt each time, and verify only the right password', async () => {
    const a = await hashPassword('correct horse battery');
    const b = await hashPassword('correct horse battery');
    expect(a).not.toBe(b);
    expect(a.startsWith('pbkdf2$100000$')).toBe(true);
    expect(await verifyPassword('correct horse battery', a)).toBe(true);
    expect(await verifyPassword('correct horse battery!', a)).toBe(false);
    expect(await verifyPassword('anything', 'garbage')).toBe(false);
  });

  it('need eight characters or more', () => {
    expect(validPassword('short')).toMatch(/8/);
    expect(validPassword('longenough')).toBeNull();
  });
});

describe('sessions', () => {
  it('store only a hash of the token, and read it back from the cookie', async () => {
    const token = 'abc123';
    expect(await sha256(token)).not.toContain(token);
    const cookie = sessionCookie(token, true);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Secure/);
    expect(readCookie('a=1; is_session=abc123; b=2', 'is_session')).toBe('abc123');
    expect(readCookie('a=1', 'is_session')).toBeNull();
  });
});

describe('sign-up details', () => {
  it('normalise emails and names', () => {
    expect(normalEmail('  Chris@Example.COM ')).toBe('chris@example.com');
    expect(validEmail('chris@example.com')).toBe(true);
    expect(validEmail('not an email')).toBe(false);
    expect(cleanName('  Lucky   Lou  ')).toBe('Lucky Lou');
    expect(cleanName('x'.repeat(50))).toHaveLength(32);
  });
});
