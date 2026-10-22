import { _electron as electron } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const build = JSON.parse(await readFile('out/latest-build.json', 'utf8'));
for (const autoGrant of [true, false]) {
 const app = await electron.launch({ executablePath: build.executable, args: ['--use-fake-device-for-media-stream', ...(autoGrant ? ['--use-fake-ui-for-media-stream'] : [])] });
 const page = await app.firstWindow(); await page.waitForLoadState();
 await app.evaluate(({session}) => {
   global.permissionRequests = [];
   session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {global.permissionRequests.push({permission,details});callback(false);});
   session.defaultSession.setPermissionCheckHandler(() => false);
 });
 const result = await page.evaluate(async () => {
   const result=[];
   for (const constraints of [{video:true,audio:false},{video:false,audio:true}]) {
     try {const stream=await navigator.mediaDevices.getUserMedia(constraints);result.push({constraints,tracks:stream.getTracks().map(t=>t.label)});stream.getTracks().forEach(t=>t.stop());}
     catch(error) {result.push({constraints,name:error.name,message:error.message});}
   }
   return result;
 });
 console.log(JSON.stringify({autoGrant,result,requests:await app.evaluate(()=>global.permissionRequests)},null,2));
 await app.close();
}
