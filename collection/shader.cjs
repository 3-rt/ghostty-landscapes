const fs=require('node:fs'),path=require('node:path');
const effects=['clouds','water','boats','surf','rings','snow','lights','leaves','sand','foliage','stars','rotor','rain'];
const f=n=>Number(n).toFixed(7),v=a=>'vec2('+a.map(f).join(',')+')';
function packed(name,layer){const [, ,w,h]=layer.rect,words=[];for(let i=0;i<layer.v.length;i+=8){let word=0;for(let j=0;j<8;j++)word|=(Math.round((layer.v[i+j]||0)*15)&15)<<(j*4);words.push('0x'+(word>>>0).toString(16)+'u');}
 return `const uint ${name}_DATA[${words.length}]=uint[${words.length}](${words.join(',')});
 float ${name}Raw(ivec2 p){if(any(lessThan(p,ivec2(0)))||any(greaterThanEqual(p,ivec2(${w},${h}))))return 0.;int i=p.y*${w}+p.x;return float((${name}_DATA[i/8]>>uint((i%8)*4))&15u)/15.;}
 float ${name}(vec2 p){if(any(lessThan(p,vec2(-1)))||any(greaterThan(p,vec2(${w+1},${h+1}))))return 0.;p-=.5;ivec2 q=ivec2(floor(p));vec2 a=fract(p);return mix(mix(${name}Raw(q),${name}Raw(q+ivec2(1,0)),a.x),mix(${name}Raw(q+ivec2(0,1)),${name}Raw(q+ivec2(1,1)),a.x),a.y);}
 `;
}
const common=`const vec2 ART_SIZE=vec2(1672.,941.);const float TAU=6.28318530718;
 float wrap(float x,float n){return mod(mod(x,n)+n,n);}
 float lineAA(float d,float r,float aa){return 1.-smoothstep(max(0.,r-aa),r+aa,d);}
 void ink(inout vec3 c,vec3 pigment,float coverage,float alpha){c=mix(c,pigment*alpha,clamp(coverage,0.,1.));}
 vec2 turn(vec2 p,float angle){float c=cos(angle),s=sin(angle);return vec2(c*p.x+s*p.y,-s*p.x+c*p.y);}
 float pulse(float age){return pow(sin(3.14159265359*age),2.);}
 `;
function seeded(count,fn){let seed=71423;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};return Array.from({length:count},(_,i)=>fn(random,i));}
function polygon(poly){return `bool waterAt(vec2 p){bool yes=false;${poly.map((a,i)=>{const b=poly[(i+1)%poly.length];if(a[1]===b[1])return '';return `if(((p.y>${f(a[1])})!=(p.y>${f(b[1])}))&&p.x<${f(a[0])}+(p.y-${f(a[1])})*${f((b[0]-a[0])/(b[1]-a[1]))})yes=!yes;`;}).join('')}return yes;}\n`;}
function makeShader(name,scene,layers){
 if(scene.legacy){let body=fs.readFileSync(path.join(__dirname,'scenes/rain/coverage.glsl'),'utf8')+fs.readFileSync(path.join(__dirname,'scenes/rain/scene.glsl'),'utf8');
  body=body.replace('if(p.y<350.)','if(EFFECT_CLOUDS && p.y<350.)').replace('if(p.y>=riverTop(p.x))','if((EFFECT_WATER || EFFECT_RINGS) && p.y>=riverTop(p.x))').replace('current*STRENGTH','current*STRENGTH*float(EFFECT_WATER)').replace('for(int i=ringDataOffsets[lo];i<ringDataOffsets[hi];i++)','for(int i=ringDataOffsets[lo];EFFECT_RINGS && i<ringDataOffsets[hi];i++)').replace('if(p.y>509. && p.y<562.)','if(EFFECT_LIGHTS && p.y>509. && p.y<562.)').replace('window*pow(STRENGTH,.7)','window*pow(STRENGTH,.7)*float(EFFECT_LIGHTS)').replace('for(int i=rainDataOffsets[lo];i<rainDataOffsets[hi];i++)','for(int i=rainDataOffsets[lo];EFFECT_RAIN && i<rainDataOffsets[hi];i++)');
  return {body,effects:['clouds','water','rings','lights','rain']};
 }
 let declarations=common,draw='',used=new Set();const use=(key,code)=>{used.add(key);draw+=`if(EFFECT_${key.toUpperCase()}){${code}}\n`;};
 if(scene.cloudCeiling){const pts=scene.cloudCeiling;declarations+=`bool cloudSkyAt(vec2 p){${pts.slice(1).map((b,i)=>{const a=pts[i];return `if(p.x<=${f(b[0])})return p.y<${f(a[1])}+(p.x-${f(a[0])})*${f((b[1]-a[1])/(b[0]-a[0]))};`;}).join('')}return p.y<${f(pts.at(-1)[1])};}\n`;}else declarations+='bool cloudSkyAt(vec2 p){return true;}\n';
 layers.forEach((layer,i)=>{layer.name='layer'+i;declarations+=packed(layer.name,layer);});
 for(const l of layers){const [x,y,w,h]=l.rect,L=l.name;
  if(l.kind==='cloud')use('clouds',`float cx=wrap(p.x-t*1672./192.-${f(x)},1672.);if(cloudSkyAt(p)&&cx<${f(w+1)}&&p.y>${f(y-1)}&&p.y<${f(y+h+1)})ink(color,vec3(201,194,220)/255.,${L}(vec2(cx,p.y-${f(y)}))*min(1.,STRENGTH*2.4),original.a);`);
  if(['boat','frond','grass','rotor'].includes(l.kind)){
   const effect=l.kind==='boat'?'boats':l.kind==='rotor'?'rotor':'foliage',pivot=l.pivot,angle=l.kind==='rotor'?`t*TAU/${f(l.period)}`:`sin(t*TAU/${f(l.period)})*${f((l.roll||0)*Math.PI/180)}`,bob=l.bob?`sin(t*TAU/${f(l.period)})*${f(l.bob)}`:'0.';
   use(effect,`vec2 q=p-${v(pivot)}-vec2(0,${bob});q=turn(q,${angle})+${v([pivot[0]-x,pivot[1]-y])};if(all(greaterThan(q,vec2(-1)))&&all(lessThan(q,vec2(${w+1},${h+1}))))ink(color,vec3(224,217,241)/255.,${L}(q)*STRENGTH,original.a);`);
  }
  if(l.kind==='window')use('lights',`if(mod(t+${f(l.phase)},${f(l.period)})<${f(l.period/2)})ink(color,vec3(240,234,250)/255.,${L}(p-${v([x,y])})*pow(STRENGTH,.7),original.a);`);
  if(l.kind==='star')use('stars',`float gain=.85+.3*(.5+.5*sin(t*TAU/${f(l.period)}+${f(l.phase*6.28318530718)}));ink(color,vec3(224,217,241)/255.,${L}(p-${v([x,y])})*STRENGTH*gain*1.6,original.a);`);
 }
 if(scene.water){declarations+=polygon(scene.water.top);const l=layers.find(l=>l.kind==='water'),[, ,w,h]=l.rect;const cycles=Math.max(1,Math.round(scene.water.speed*192/w));const vertical=scene.water.vertical?1:0;
  use('water',`if(waterAt(p)){vec2 q=vec2(wrap(p.x-t*${f(w*cycles/192)},${f(w)}),wrap(p.y${vertical?`-t*${f(h/192)}`:''},${f(h)}));float depth=clamp((p.y-630.)/310.,.4,1.);ink(color,vec3(224,217,241)/255.,${l.name}(q)*STRENGTH*depth,original.a);}`);
 }
 for(const r of scene.rings||[])use('rings',`vec2 d=p-${v([r.x,r.y])};if(abs(d.x)<32.&&abs(d.y)<8.){float age=fract(t/${f(r.period)}+${f(r.phase)});vec2 radius=vec2(3.+age*26.,1.+age*5.);float line=lineAA(abs(length(d/radius)-1.)*radius.y,.5,aa);float dash=1.-smoothstep(1.5,2.5,mod((atan(d.y/radius.y,d.x/radius.x)+TAU)*radius.x,5.));ink(color,vec3(217,208,231)/255.,line*dash*pulse(age)*STRENGTH*1.7,original.a);}`);
 for(let n=0;n<(scene.surf||[]).length;n++){const s=scene.surf[n],dx=s.b[0]-s.a[0],dy=s.b[1]-s.a[1],len=Math.hypot(dx,dy),normal=[-dy/len,dx/len];use('surf',`if(waterAt(p)){float age=fract(t/${f(s.period)}+${f(n*.31)});vec2 d=p-${v(s.a)}-${v(normal)}*(1.-age)*12.;float along=dot(d,${v([dx/len,dy/len])});float distance=abs(dot(d,${v(normal)}));if(along>0.&&along<${f(len)}&&distance<3.){float dash=1.-smoothstep(2.,3.,mod(along,7.));ink(color,vec3(224,217,241)/255.,lineAA(distance,.5,aa)*dash*pulse(age)*STRENGTH*1.8,original.a);}}`);}
 if(scene.snow){const particles=seeded(scene.snow.count,(r,i)=>({x:r()*1672,phase:r(),period:scene.snow.periods[i%2],size:.6+r()*.8,drift:5+r()*13})).sort((a,b)=>a.x-b.x);
  declarations+=`const vec4 snowData[${particles.length}]=vec4[${particles.length}](${particles.map(p=>`vec4(${f(p.x)},${f(p.phase)},${f(p.period)},${f(p.size)})`).join(',')});\n`;
  const offsets=Array.from({length:28},(_,n)=>{const i=particles.findIndex(p=>p.x>=n*64);return i<0?particles.length:i;});declarations+=`const int snowOffsets[28]=int[28](${offsets.join(',')});\n`;
  use('snow',`int lo=clamp(int(floor((p.x-22.)/64.)),0,26),hi=clamp(int(floor((p.x+22.)/64.))+1,0,27);for(int i=snowOffsets[lo];i<snowOffsets[hi];i++){vec4 r=snowData[i];float age=fract(t/r.z+r.y);vec2 pos=vec2(r.x+sin(age*TAU+r.y*TAU)*16.,age*780.-40.);vec2 d=abs(p-pos);if(any(greaterThan(d,vec2(3))))continue;float flake=lineAA(length(d),r.w,aa);if(i%3==0)flake=max(flake,max(lineAA(d.x,.35,aa)*lineAA(d.y,1.8,aa),lineAA(d.y,.35,aa)*lineAA(d.x,1.8,aa))*.65);float fade=smoothstep(0.,.04,age)*(1.-smoothstep(.87,1.,age));ink(color,vec3(224,217,241)/255.,flake*fade*STRENGTH*1.8,original.a);}`);
 }
 if(scene.leaves){const particles=seeded(scene.leaves.count,(r,i)=>({x:80+r()*1500,phase:r(),period:scene.leaves.periods[i%3],turn:r()*6.28,source:i%scene.leafSources.length})).sort((a,b)=>a.x-b.x);const leaves=layers.filter(l=>l.kind==='leaf');
  declarations+=`const vec4 leafData[24]=vec4[24](${particles.map(p=>`vec4(${f(p.x)},${f(p.phase)},${f(p.period)},${f(p.turn)})`).join(',')});\n`;
  const offsets=Array.from({length:28},(_,n)=>{const i=particles.findIndex(p=>p.x>=n*64);return i<0?particles.length:i;});declarations+=`const int leafOffsets[28]=int[28](${offsets.join(',')});const int leafTypes[24]=int[24](${particles.map(p=>p.source).join(',')});\n`;
  use('leaves',`int lo=clamp(int(floor((p.x-100.)/64.)),0,26),hi=clamp(int(floor((p.x+100.)/64.))+1,0,27);for(int i=leafOffsets[lo];i<leafOffsets[hi];i++){vec4 r=leafData[i];float age=fract(t/r.z+r.y);float y=age<.82?mix(-30.,730.,age/.82):730.+(age-.82)*390.;float x=r.x+sin(age*TAU+r.w)*32.+(age>.82?(age-.82)*180.:0.);vec2 d=p-vec2(x,y);if(any(greaterThan(abs(d),vec2(24))))continue;vec2 q=turn(d,sin(age*TAU+r.w)*.7);q.x/=max(.3,abs(cos(age*TAU+r.w)));float coverage=0.;${leaves.map((l,i)=>`if(leafTypes[i]==${i})coverage=${l.name}(q+vec2(${f(l.rect[2]/2)},${f(l.rect[3]/2)}));`).join('')}float fade=smoothstep(0.,.05,age)*(1.-smoothstep(.9,1.,age));if(age>.82&&!waterAt(p))coverage=0.;ink(color,vec3(224,217,241)/255.,coverage*fade*STRENGTH*1.6,original.a);}`);
 }
 if(scene.sand){const pts=seeded(scene.sand.count,(r,i)=>({phase:r(),period:scene.sand.periods[i%2],offset:r()*10}));use('sand',scene.sand.bands.map((b,n)=>{const dx=b.b[0]-b.a[0],dy=b.b[1]-b.a[1];return `if(p.x>${f(b.a[0]-10)}&&p.x<${f(b.b[0]+10)}&&p.y>${f(b.a[1]-15)}&&p.y<${f(b.b[1]+15)}){${pts.filter((_,i)=>i%3===n).map(r=>`{float age=fract(t/${f(r.period)}+${f(r.phase)});vec2 d=p-(${v(b.a)}+${v([dx,dy])}*age+vec2(0,${f(r.offset)}));if(abs(d.x)<5.&&abs(d.y)<2.)ink(color,vec3(201,194,220)/255.,lineAA(abs(d.y),.35,aa)*lineAA(abs(d.x),2.5,aa)*pulse(age)*STRENGTH*2.,original.a);}`).join('')}}`;}).join(''));}
 const main=`void mainImage(out vec4 fragColor,in vec2 fragCoord){vec2 uv=fragCoord/iResolution.xy;vec4 original=texture(iChannel0,uv);fragColor=original;if(STRENGTH<=0.||BG_ALPHA>=.999||abs(original.a-BG_ALPHA)>.0015)return;float scale=max(iResolution.x/ART_SIZE.x,iResolution.y/ART_SIZE.y);vec2 offset=(iResolution.xy-ART_SIZE*scale)*.5;vec2 p=(fragCoord-offset)/scale;if(any(lessThan(p,vec2(0)))||any(greaterThanEqual(p,ART_SIZE)))return;float t=mod(iTime,192.),aa=max(.3,.6/scale);vec3 color=original.rgb;${draw}fragColor=vec4(color,original.a);}\n`;
 return {body:declarations+main,effects:[...used]};
}
function native(body){return '// Generated by collection/build.cjs. Edit scene sources, not this file.\n'+effects.map(k=>`#define EFFECT_${k.toUpperCase()} true`).join('\n')+'\n'+body;}
function preview(body){
 const atlas=[],offsets={};let source=body.replace(/const uint (\w+)_DATA\[\d+\]=uint\[\d+\]\(([\s\S]*?)\);/g,(_,name,values)=>{offsets[name]=atlas.length;atlas.push(...values.match(/0x[0-9a-f]+u/g).map(v=>parseInt(v.slice(0,-1),16)));return '';});
 for(const [name,offset] of Object.entries(offsets))source=source.replaceAll(`${name}_DATA[i/8]`,`texelFetch(coverageAtlas,ivec2((${offset}+i/8)%1024,(${offset}+i/8)/1024),0).r`);
 source=source.replace('vec4 original=texture(iChannel0,uv);','float coverScale=max(iResolution.x/ART_SIZE.x,iResolution.y/ART_SIZE.y);vec2 imageUV=(fragCoord-(iResolution.xy-ART_SIZE*coverScale)*.5)/coverScale/ART_SIZE;vec4 original=vec4(mix(vec3(35,33,54)/255.,texture(iChannel0,imageUV).rgb,STRENGTH)*BG_ALPHA,BG_ALPHA);');
 return {atlas,source:`#version 300 es\nprecision highp float;precision highp int;uniform highp usampler2D coverageAtlas;uniform vec3 iResolution;uniform float iTime;uniform float STRENGTH;uniform float BG_ALPHA;uniform sampler2D iChannel0;${effects.map(k=>`uniform bool EFFECT_${k.toUpperCase()};`).join('')}out vec4 outColor;${source}\nvoid main(){mainImage(outColor,vec2(gl_FragCoord.x,iResolution.y-gl_FragCoord.y));outColor=vec4(outColor.rgb/BG_ALPHA,1.);}`};
}
module.exports={makeShader,native,preview,effects};
