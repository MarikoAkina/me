import {cp, mkdir, rm} from 'node:fs/promises';
await rm('desktop/ui', {recursive: true, force: true});
await cp('dist', 'desktop/ui', {recursive: true});
await mkdir('desktop/licenses', {recursive: true});
await cp('LICENSE', 'desktop/licenses/SQL-LAB-MIT.txt');
await cp('THIRD_PARTY_NOTICES.md', 'desktop/licenses/THIRD_PARTY_NOTICES.md');
await cp('vendor/shadcn-tailwind-4.13.0.LICENSE.md', 'desktop/licenses/shadcn-MIT.txt');
console.log('Desktop resources ready.');
