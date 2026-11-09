// The pit boss's keys: makes an existing account a pit boss (admin), or takes it away.
//
//   npm run admin -w @idlesuits/server -- grant you@example.com           (the live database)
//   npm run admin -w @idlesuits/server -- revoke you@example.com --local  (the local one)
//   npm run admin -w @idlesuits/server -- list
//
// Sign up in the game first: this only changes an account that already exists.
import { execFileSync } from 'node:child_process';

const [action, email, ...rest] = process.argv.slice(2);
const where = rest.includes('--local') || email === '--local' ? '--local' : '--remote';
const run = (sql) => execFileSync('npx', ['wrangler', 'd1', 'execute', 'idlesuits', where, '--command', sql], { stdio: 'inherit' });

if (action === 'list') {
  run("SELECT email, name, role, datetime(created_at / 1000, 'unixepoch') AS joined FROM users WHERE role = 'admin' ORDER BY created_at");
} else if ((action === 'grant' || action === 'revoke') && email) {
  const clean = email.trim().toLowerCase();
  // Only plain email characters reach the SQL.
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(clean)) {
    console.error(`That doesn't look like an email: ${email}`);
    process.exit(1);
  }
  run(`UPDATE users SET role = '${action === 'grant' ? 'admin' : 'player'}' WHERE email = '${clean}'`);
  run(`SELECT email, name, role FROM users WHERE email = '${clean}'`);
} else {
  console.error('Usage: npm run admin -w @idlesuits/server -- grant|revoke <email> [--local]  |  list [--local]');
  process.exit(1);
}
