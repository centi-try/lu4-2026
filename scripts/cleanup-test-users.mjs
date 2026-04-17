import fs from 'fs';
import path from 'path';

const dbFile = path.join(process.cwd(), 'data_storage.json');
const db = JSON.parse(fs.readFileSync(dbFile, 'utf8'));

const keepEmail = 'superadmin@inventory.com';
const removedEmails = db.users
  .filter((user) => user.email !== keepEmail)
  .map((user) => user.email);

db.users = db.users.filter((user) => user.email === keepEmail);
db.auditLogs = (db.auditLogs || []).filter((log) => {
  const details = log.details || {};
  const targetEmail = details.targetEmail || '';
  return targetEmail === '' || targetEmail === keepEmail;
});

fs.writeFileSync(dbFile, JSON.stringify(db, null, 2) + '\n');
console.log(JSON.stringify({ ok: true, removedEmails }, null, 2));
