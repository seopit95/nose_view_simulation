from pathlib import Path
import json,zipfile,shutil,hashlib,re
root=Path(__file__).resolve().parent/'noseview'; dest=root.parent.parent/'outputs'
b=json.loads((root/'out/latest-build.json').read_text()); e=json.loads((root/'qa/e2e-report.json').read_text()); c=json.loads((root/'qa/camera-permission-report.json').read_text())
assert e['packagedApplication'] and len(e['checks'])==20 and not e.get('failure') and not e['errors'] and not e['externalRequests']
assert len(c['checks'])==3 and not c.get('failure')
metrics=next(x['detail']['cameraMetrics'] for x in e['checks'] if x['name']=='Animated camera stream uses actual VIDEO inference')
p=root/'docs/validation.md'; s=p.read_text(); s=re.sub(r'가상 카메라 검증 중 UI에서 .*? 한 차례 관측되었다\.', f'가상 카메라 검증 중 UI에서 `{metrics}`가 한 차례 관측되었다.',s); p.write_text(s)
appzip=dest/'NoseView-0.1.0-Mac-AppleSilicon.zip';shutil.copyfile(b['zip'],appzip)
with zipfile.ZipFile(appzip) as z:assert z.testzip() is None
shutil.copyfile(root/'qa/desktop-demo.png',dest/'NoseView_실행화면.png')
shutil.copyfile(root/'docs/validation.md',dest/'NoseView_검증결과.md')
sourcezip=dest/'NoseView-0.1.0-Source.zip'
folders={'src','desktop','scripts','tests','public','docs','licenses'}
files={'package.json','package-lock.json','tsconfig.json','vite.config.ts','vite.worker.config.ts','index.html','README.md','THIRD_PARTY_NOTICES.md','.gitignore'}
qa={'e2e-report.json','camera-permission-report.json','desktop-demo.png','export-dialog.png'}
entries=[]
for part in folders:
 for p in (root/part).rglob('*'):
  if not p.is_file():continue
  rel=p.relative_to(root)
  if rel.parts[:2]==('public','vendor'):continue
  entries.append(p)
entries += [root/p for p in files]+[root/'qa'/p for p in qa]
with zipfile.ZipFile(sourcezip,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for p in sorted(entries):z.write(p,Path('NoseView-source')/p.relative_to(root))
with zipfile.ZipFile(sourcezip) as z:
 assert z.testzip() is None
 assert z.read('NoseView-source/src/App.tsx')==(root/'src/App.tsx').read_bytes()
 assert z.read('NoseView-source/package-lock.json')==(root/'package-lock.json').read_bytes()
manifest={}
for p in [appzip,sourcezip,dest/'NoseView_실행안내.md',dest/'NoseView_검증결과.md',dest/'NoseView_실행화면.png']:
 manifest[p.name]={'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
(dest/'NoseView_파일검증.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
print(json.dumps({'source_files':len(entries),'checks':len(e['checks'])+len(c['checks']),'deliverables':manifest},ensure_ascii=False,indent=2))
