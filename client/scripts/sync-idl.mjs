// Copies the IDL and generated types from `anchor build` into the client. Run after every build.
import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
mkdirSync(here('../src/idl'), { recursive: true });
copyFileSync(here('../../target/idl/abyss_haul.json'), here('../src/idl/abyss_haul.json'));
copyFileSync(here('../../target/types/abyss_haul.ts'), here('../src/idl/abyss_haul.ts'));
console.log('IDL synced to client/src/idl');
