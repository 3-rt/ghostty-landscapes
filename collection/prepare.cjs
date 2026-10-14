const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),scenes=require('./scenes.cjs'),prepare=require('./artwork.cjs');
const browserOptions=require('./browser.cjs');
const root=__dirname,dataURL=p=>'data:image/png;base64,'+fs.readFileSync(p).toString('base64');
(async()=>{const browser=await chromium.launch(browserOptions());try{const page=await browser.newPage();
 for(const [name,scene] of Object.entries(scenes)){
  if(scene.legacy)continue;if(process.argv[2]&&name!==process.argv[2])continue;
  const dir=path.join(root,'scenes',name);
  const r=await page.evaluate(prepare,{scene,originalURL:dataURL(path.join(dir,'original.png')),cleanURL:dataURL(path.join(dir,'clean-generated.png'))});
  fs.writeFileSync(path.join(dir,'base.png'),Buffer.from(r.base,'base64'));delete r.base;
  fs.writeFileSync(path.join(dir,'layers.json'),JSON.stringify(r));
  console.log(`${name}: ${r.layers.length} layers; ${r.removed.length} removed particles; ${r.protectedPixels} exact original scenery pixels preserved`);
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
