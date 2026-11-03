// Include the actual installed dependency notices in every build, including
// build-time packages. Fail when a package's license cannot be located.
import {readFileSync,readdirSync,statSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const lock=JSON.parse(readFileSync('package-lock.json','utf8')),parts=['Third-party licenses / 第三方许可\nGenerated from package-lock.json; do not remove from distributions.\n'];
for(const [path,entry]of Object.entries(lock.packages)){
 if(!path)continue;const root=resolve(path);
 let names;try{names=readdirSync(root);}catch{continue;} // platform-specific optional dependencies
 let files=names.filter(n=>/^(licen[sc]e|copying|notice)([.\-_]|$)/i.test(n)&&statSync(resolve(root,n)).isFile());
 const supplemental={'node_modules/@vue/devtools-api':'vue-devtools-LICENSE.txt','node_modules/dlv':'dlv-LICENSE.txt'}[path];
 if(!files.length&&supplemental){parts.push(`\n===== ${path} @ ${entry.version} =====\n`,readFileSync('licenses/'+supplemental,'utf8'));continue;}
 if(!files.length&&path.includes('node_modules/@esbuild/')){parts.push(`\n===== ${path} @ ${entry.version} (esbuild MIT) =====\n`,readFileSync('node_modules/esbuild/LICENSE.md','utf8'));continue;}
 if(!files.length&&path.includes('node_modules/@rollup/')){parts.push(`\n===== ${path} @ ${entry.version} (Rollup MIT) =====\n`,readFileSync('node_modules/rollup/LICENSE.md','utf8'));continue;}
 if(!files.length){const p=JSON.parse(readFileSync(resolve(root,'package.json'),'utf8'));if(!p.license)throw Error('Missing license metadata: '+path);throw Error('Missing license text: '+path);}
 parts.push(`\n===== ${path} @ ${entry.version} (${entry.license??'see below'}) =====\n`);
 for(const file of files)parts.push(readFileSync(resolve(root,file),'utf8'));
}
writeFileSync('public/third-party-notices.txt',parts.join('\n'));
