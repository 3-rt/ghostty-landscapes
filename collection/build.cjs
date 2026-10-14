const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const scenes=require('./scenes.cjs'),shader=require('./shader.cjs');
const out=path.join(__dirname,'build');fs.mkdirSync(out,{recursive:true});const manifest={loop:192,scenes:[]};
for(const [id,scene] of Object.entries(scenes)){
 const dir=path.join(__dirname,'scenes',id);const layers=scene.legacy?[]:JSON.parse(fs.readFileSync(path.join(dir,'layers.json'))).layers;
 const {body,effects}=shader.makeShader(id,scene,layers),template=shader.native(body);
 const basePath=path.join(dir,'base.png');
 const bytes=fs.readFileSync(basePath),digest=crypto.createHash('sha256').update(bytes).digest('hex').slice(0,12),filename=`ghost-bg-${id}-${digest}.png`;
 fs.writeFileSync(path.join(out,filename),bytes);fs.writeFileSync(path.join(dir,'scene.template.glsl'),template);
 fs.writeFileSync(path.join(out,id+'-preview.png'),bytes);
 fs.writeFileSync(path.join(out,`${id}.frag`),fs.readFileSync(path.join(__dirname,'../shader/ghostty-prefix.glsl'),'utf8')+'\nconst float STRENGTH=.18;const float BG_ALPHA=.8;\n'+template);
 const preview=shader.preview(body);
 const thumbnailPath=path.join(out,id+'-preview.png');
 manifest.scenes.push({id,title:scene.title,description:scene.description,effects,base_file:filename,base_url:'data:image/png;base64,'+bytes.toString('base64'),thumbnail:'data:image/png;base64,'+fs.readFileSync(thumbnailPath).toString('base64'),shader:preview.source,atlas:preview.atlas});
 console.log(`${id}: ${(Buffer.byteLength(template)/1024).toFixed(0)} KiB shader; ${effects.join(', ')}`);
}
fs.writeFileSync(path.join(out,'gallery-data.js'),'window.GHOST_COLLECTION='+JSON.stringify(manifest)+';\n');
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({...manifest,scenes:manifest.scenes.map(({shader,base_url,thumbnail,atlas,...s})=>s)},null,2));
const catalog=Object.fromEntries(manifest.scenes.map(s=>[s.id,{file:s.base_file,preview_file:s.id+'-preview.png',title:s.title,description:s.description,animated:true,shader_template:path.join(__dirname,'scenes',s.id,'scene.template.glsl'),preview_path:'file://'+path.join(__dirname,'index.html')+'?scene='+s.id,source:'Archived original artwork and image_gen clean plates; see collection/scenes/'+s.id+'/provenance.json'}]));
fs.writeFileSync(path.join(out,'catalog.json'),JSON.stringify(catalog,null,2)+'\n');
