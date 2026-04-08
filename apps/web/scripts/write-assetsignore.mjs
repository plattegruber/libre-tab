// Generated build artifacts in .svelte-kit/cloudflare/ that must NOT be served
// as public static assets by Cloudflare Workers.
//
// `_worker.js` is the Worker entry — exposing it would publish server-side code.
// `_routes.json` and `_headers` are legacy Pages-only files that have no
// meaning under the Workers + Static Assets runtime.
import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dir = '.svelte-kit/cloudflare';
if (!existsSync(dir)) {
	console.error(`write-assetsignore: ${dir} does not exist; skipping.`);
	process.exit(0);
}

const ignored = ['_worker.js', '_routes.json', '_headers'];
writeFileSync(join(dir, '.assetsignore'), ignored.join('\n') + '\n');
console.log(`write-assetsignore: wrote ${dir}/.assetsignore`);
