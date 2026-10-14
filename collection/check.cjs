const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {chromium}=require('playwright'),manifest=require('./build/manifest.json'),scenes=require('./scenes.cjs');
const browserOptions=require('./browser.cjs');
const hash=b=>createHash('sha256').update(b).digest('hex'),all=['clouds','water','boats','surf','rings','snow','lights','leaves','sand','foliage','stars','rotor','rain'];
(async()=>{const browser=await chromium.launch(browserOptions());try{
 const products=['gallery-data.js','catalog.json',...manifest.scenes.map(s=>s.id+'-preview.png')];
 const before=new Map(products.map(name=>[name,hash(fs.readFileSync(path.join(__dirname,'build',name)))]));
 const page=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('file://'+path.join(__dirname,'index.html'));await page.evaluate(()=>window.ready);await page.evaluate(()=>collectionPreview.pause());
 async function frame(t,disabled=[]){return Buffer.from((await page.evaluate(({t,disabled})=>collectionPreview.frame(t,disabled),{t,disabled})).split(',')[1],'base64');}
 for(const scene of manifest.scenes){
  await page.evaluate(id=>collectionPreview.select(id),scene.id);
  const start=await frame(0),end=await frame(192),middle=await frame(2);
  assert.equal(hash(start),hash(end),scene.id+' loop');assert.notEqual(hash(start),hash(middle),scene.id+' motion');assert.equal(hash(await frame(0,all)),hash(await frame(8,all)),scene.id+' fixed scenery');
  for(const key of scene.effects){const disabled=all.filter(k=>k!==key);const t=key==='lights'?50:key==='stars'?4:2;assert.notEqual(hash(await frame(0,disabled)),hash(await frame(t,disabled)),scene.id+' '+key+' does not move');}
  if(scene.id==='coast'){
   const island=await page.evaluate(()=>{const c=document.querySelector('#primary'),gl=c.getContext('webgl2'),scale=c.width/1672;function pixels(t){collectionPreview.frame(t,['water','boats','surf']);const x=Math.round(430*scale),top=Math.round(505*scale),w=Math.round(80*scale),h=Math.round(29*scale),out=new Uint8Array(w*h*4);gl.readPixels(x,c.height-top-h,w,h,gl.RGBA,gl.UNSIGNED_BYTE,out);return Array.from(out);}const a=pixels(0),b=pixels(8);return a.every((v,i)=>v===b[i]);});
   assert.equal(island,true,'coast distant island must stay anchored under moving clouds');
  }
  await frame(8);await page.screenshot({path:path.join(__dirname,'build',scene.id+'-gallery.png'),fullPage:true});
  fs.writeFileSync(path.join(__dirname,'build',scene.id+'-terminal.png'),await frame(8));
  await page.evaluate(()=>{collectionPreview.settings.strength=1;});fs.writeFileSync(path.join(__dirname,'build',scene.id+'-evidence-preview.png'),await frame(0));await page.evaluate(()=>{collectionPreview.settings.strength=.18;});
  console.log('PASS '+scene.id+': motion layers, exact loop, fixed scenery, rendered previews');
 }
 await page.getByRole('button',{name:'Compare scenes',exact:true}).click();await page.selectOption('#second','windmill');await page.evaluate(()=>collectionPreview.compare('windmill'));assert.equal(await page.locator('.comparison').isVisible(),true);
 await page.selectOption('#shape','portrait');assert.equal(await page.locator('.workspace').evaluate(e=>e.classList.contains('portrait')),true);await page.screenshot({path:path.join(__dirname,'build','comparison-portrait.png'),fullPage:true});
 await page.getByLabel('Sample text',{exact:true}).uncheck();assert.equal(await page.locator('.terminal-text').first().isVisible(),false);
 await page.locator('#strength').fill('100');await page.locator('#strength').dispatchEvent('input');assert.equal(await page.locator('#strength-value').innerText(),'100%');await page.getByRole('button',{name:'Terminal: 18%',exact:true}).click();assert.equal(await page.locator('#strength-value').innerText(),'18%');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(__dirname,'build','mobile-gallery.png'),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'mobile overflow');
 assert.deepEqual(errors,[]);
 for(const [name,digest] of before)assert.equal(hash(fs.readFileSync(path.join(__dirname,'build',name))),digest,'checks must preserve install artifact '+name);
 const embedded=await page.evaluate(()=>GHOST_COLLECTION.scenes.map(({id,thumbnail})=>({id,thumbnail})));
 for(const {id,thumbnail} of embedded)assert.equal(hash(Buffer.from(thumbnail.split(',')[1],'base64')),before.get(id+'-preview.png'),'gallery and installed preview must match: '+id);
 console.log('PASS gallery controls, comparison, narrow crop, strength, text, mobile layout, and stable install artifacts');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
