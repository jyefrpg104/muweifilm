// Dev and production must never share a Drive namespace.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const sources=['cloud-backup.js','quest-archive.js'].map(file=>fs.readFileSync(__dirname+'/../photo-quest/'+file,'utf8'));
function envFor(hostname){
  const context={console,Intl,JSON,Map,Set,URL,location:hostname===undefined?undefined:{hostname}};
  context.window=context;vm.createContext(context);sources.forEach(source=>vm.runInContext(source,context));
  const drive=context.PhotoQuestDrive.DRIVE_ENV,archive=context.PhotoQuestArchive.DRIVE_ENV;
  assert.deepEqual({...drive},{...archive},'backup and archive must agree on the namespace');
  return drive;
}
for(const host of ['www.muweifilm.com','muweifilm.com',undefined]){
  const env=envFor(host);
  assert.equal(env.tag,'v1');assert.equal(env.folder,'Photo Quest');assert.equal(env.dev,false);
}
for(const host of ['dev.muweifilm-dev.pages.dev','feature-x.muweifilm-dev.pages.dev','localhost','127.0.0.1','muweifilm.com.evil.example']){
  const env=envFor(host);
  assert.equal(env.tag,'dev-v1',host);assert.equal(env.folder,'Photo Quest (dev)',host);assert.equal(env.dev,true,host);
}
console.log('PASS production domain uses the real Drive namespace; every other host uses the separate dev namespace');
