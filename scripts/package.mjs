// Builds dist/meet-soundboard-<version>.zip with only what Chrome needs to load the extension,
// leaving out the dev tooling, docs and the icon source.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';

const EXTENSION_FILES = ['manifest.json', 'content', 'popup', 'shared', 'icons/*.png', 'sounds', 'LICENSE'];

const { version } = JSON.parse(readFileSync('manifest.json', 'utf8'));
const packageVersion = JSON.parse(readFileSync('package.json', 'utf8')).version;
if (version !== packageVersion) {
  throw new Error(`manifest.json is at ${version} but package.json at ${packageVersion}`);
}

const tag = process.env.RELEASE_TAG ?? process.env.GITHUB_REF_NAME;
if (tag && tag.startsWith('v') && tag !== `v${version}`) {
  throw new Error(`tag ${tag} does not match manifest version ${version}`);
}

const archive = `dist/meet-soundboard-${version}.zip`;
mkdirSync('dist', { recursive: true });
rmSync(archive, { force: true });
execFileSync('sh', ['-c', `zip -qr -X "${archive}" ${EXTENSION_FILES.join(' ')} -x '*.DS_Store'`], { stdio: 'inherit' });
console.log(archive);
