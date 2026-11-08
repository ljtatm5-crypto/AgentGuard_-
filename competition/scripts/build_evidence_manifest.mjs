import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root = path.join(process.cwd(), 'competition/04_运行证据');
const entries = [];
function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full);
    else if (name !== 'evidence_manifest.json') {
      const digest = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
      entries.push({ path: path.relative(root, full).replaceAll('\\\\', '/'), bytes: stat.size, sha256: digest });
    }
  }
}
walk(root);
entries.sort((a, b) => a.path.localeCompare(b.path));
const out = { generated_at: new Date().toISOString(), root: 'competition/04_运行证据', files: entries };
fs.writeFileSync(path.join(root, 'evidence_manifest.json'), JSON.stringify(out, null, 2), 'utf8');
console.log(`manifest files=${entries.length}`);