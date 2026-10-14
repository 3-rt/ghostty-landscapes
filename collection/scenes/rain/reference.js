const canvas=document.querySelector('#scene'),ctx=canvas.getContext('2d');
const base=new Image(),clouds=new Image(),waterArt=new Image();
base.src='__BASE__';clouds.src='__CLOUDS__';waterArt.src='__WATER__';
const LOOP=192,TAU=Math.PI*2;
const wrap=(x,n)=>((x%n)+n)%n;
let seed=71423;
function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
const drops=Array.from({length:135},(_,i)=>({x:random()*1900-110,phase:random(),duration:[8,4,8/3][i%3],length:7+random()*7,alpha:.5+random()*.35}));
const splashes=Array.from({length:32},(_,i)=>({x:random()*1672,y:590+random()*330,phase:random(),duration:[3,4,6][i%3]}));
const lamps=[[124,522],[286,527],[368,533],[984,549],[1041,540],[1128,541],[1207,539],[1330,536],[1465,535],[1544,529]];
const cloudRegions=[[0,20,680,267],[705,195,500,155],[1015,5,657,209]];
const settings={strength:1,rain:true,clouds:true,water:true,waterMode:'combined',lights:true,text:false};
const houses=[
 {phase:42,windows:[[1232,525,6,8],[1242,524,4,9]]},
 {phase:30,windows:[[1289,530,5,10],[1299,530,5,10]]},
 {phase:18,windows:[[1420,531,5,12],[1430,531,5,12]]},
 {phase:6,windows:[[1544,495,4,13],[1557,494,6,13]]}
];
function houseIsLit(time,index){return wrap(time+houses[index].phase,96)<48;}
const housePlate=document.createElement('canvas');housePlate.width=1672;housePlate.height=941;
function prepareHouses(){
 const c=housePlate.getContext('2d');c.drawImage(base,0,0);
 c.fillStyle='#202031';c.globalAlpha=.92;
 for(const house of houses)for(const [x,y,w,h] of house.windows)c.fillRect(x,y,w,h);
}
const currentLayer=document.createElement('canvas'),reflectionLayer=document.createElement('canvas');
for(const layer of [currentLayer,reflectionLayer]){layer.width=1672;layer.height=941;}
function riverPath(c){
 c.beginPath();c.moveTo(0,577);c.lineTo(961,577);c.lineTo(961,594);
 c.lineTo(1672,597);c.lineTo(1672,941);c.lineTo(0,941);c.closePath();
}
function prepareWater(){
 // Current samples come only from open foreground water, never reflected scenery.
 const source=document.createElement('canvas');source.width=1672;source.height=941;
 const c=source.getContext('2d');c.drawImage(waterArt,0,0);
 const original=c.getImageData(0,0,1672,941);
 const moving=c.createImageData(1672,941),reflected=c.createImageData(1672,941);
 const columns=[...lamps.map(([x])=>x),620,714,810,900,1162,1247,1288,1370,1415,1500,1590,1630];
 for(let y=577;y<941;y++)for(let x=0;x<1672;x++){
  if(x>=961&&y<597)continue;
  const i=(y*1672+x)*4;
  const ink=Math.max(0,Math.min(1,(original.data[i]-35)/189));
  let reflection=y<641?1:0;
  columns.forEach((cx,j)=>{
   const depth=y-(cx<961?577:597);
   const end=j>=10&&j<14?105:cx<400?170:364;
   const width=24+depth*.1;
   const edge=Math.max(0,Math.min(1,(width-Math.abs(x-cx))/6));
   reflection=Math.max(reflection,edge*Math.max(0,Math.min(1,(end-depth)/15)));
  });
  reflected.data[i]=224;reflected.data[i+1]=217;reflected.data[i+2]=241;
  reflected.data[i+3]=Math.round(255*ink*reflection);
  // This rectangle contains only the original horizontal dotted water strokes.
  // Tile it across the river; compress distant rows to preserve perspective.
  const sy=y<741?740+Math.floor((y-577)*200/164):740+(y-741);
  const sx=wrap(x+(y<741?418:0),836);
  const sourceIndex=(sy*1672+sx)*4;
  const surfaceInk=Math.max(0,Math.min(1,(original.data[sourceIndex]-35)/189));
  const distance=.6+.4*(y-577)/364;
  moving.data[i]=224;moving.data[i+1]=217;moving.data[i+2]=241;
  moving.data[i+3]=Math.round(255*surfaceInk*distance);

 }
 currentLayer.getContext('2d').putImageData(moving,0,0);
 reflectionLayer.getContext('2d').putImageData(reflected,0,0);
}
function cloudX(time,x,depth=1){return wrap(x+time*1672/LOOP*depth,1672);}
function draw(time,overrides={}){
 const s={...settings,...overrides};time=wrap(time,LOOP);
 const waterTime=s.water?time:0;
 ctx.setTransform(canvas.width/1672,0,0,canvas.height/941,0,0);
 ctx.globalAlpha=1;ctx.fillStyle='#232136';ctx.fillRect(0,0,1672,941);
 ctx.globalAlpha=s.strength;ctx.drawImage(housePlate,0,0,1672,941);
 ctx.globalAlpha=Math.min(1,s.strength*1.4);
 for(const [x,y,w,h] of cloudRegions){
  const dx=cloudX(s.clouds?time:0,x,y>190?2:1);
  for(const shift of [-1672,0])ctx.drawImage(clouds,x,y,w,h,dx+shift,y,w,h);
 }
 ctx.save();riverPath(ctx);ctx.clip();
 ctx.lineWidth=1;ctx.lineCap='round';ctx.strokeStyle='#d9d0e7';
 const flowing=s.water&&['combined','current'].includes(s.waterMode);
 const dx=flowing?wrap(waterTime*1672/LOOP,1672):0;
 ctx.globalAlpha=s.strength;
 for(const shift of [-1672,0])ctx.drawImage(currentLayer,dx+shift,0);
 ctx.globalAlpha=s.strength;ctx.drawImage(reflectionLayer,0,0);
 if(s.water&&['combined','rings'].includes(s.waterMode))for(const r of splashes){
  const p=wrap(waterTime/r.duration+r.phase,1);
  ctx.globalAlpha=Math.sin(Math.PI*p)**2*.85*s.strength;
  ctx.setLineDash([2,3]);ctx.beginPath();ctx.ellipse(r.x,r.y,3+p*17,1+p*2,0,0,TAU);ctx.stroke();
 }
 ctx.restore();ctx.setLineDash([]);
 lamps.forEach(([x,y])=>{
  const light=.9;
  // Keep tiny light sources legible at terminal strength without brightening scenery.
  const gain=Math.pow(s.strength,.6);
  ctx.fillStyle='#f2e5fb';ctx.globalAlpha=gain*light;
  ctx.beginPath();ctx.arc(x,y,3.1,0,TAU);ctx.fill();
  const halo=ctx.createRadialGradient(x,y,2,x,y,12);
  halo.addColorStop(0,'rgba(238,216,255,.35)');halo.addColorStop(1,'rgba(238,216,255,0)');
  ctx.fillStyle=halo;ctx.globalAlpha=gain*light;
  ctx.fillRect(x-12,y-12,24,24);
 });
 houses.forEach((house,i)=>{
  if(!houseIsLit(s.lights?time:0,i))return;
  ctx.globalAlpha=Math.pow(s.strength,.7);
  for(const [x,y,w,h] of house.windows)ctx.drawImage(base,x,y,w,h,x,y,w,h);
 });
 if(s.rain){
  ctx.lineWidth=1;ctx.strokeStyle='#b5aecb';ctx.setLineDash([2,3]);
  for(const d of drops){
   const p=wrap(time/d.duration+d.phase,1),y=p*1021-40,x=d.x-(y-470)*.32;
   ctx.globalAlpha=d.alpha*Math.min(1,p*30,(1-p)*30)*s.strength;
   ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-d.length*.32,y+d.length);ctx.stroke();
  }
 }
 ctx.setLineDash([]);ctx.globalAlpha=1;
 if(s.text){ctx.font='19px Menlo,monospace';ctx.fillStyle='#e0def4';['basil ~ % spotify_player','','LIBRARY                 NOW PLAYING','Liked songs             A quiet evening','Albums                  Rain on the river','Playlists'].forEach((line,i)=>ctx.fillText(line,48,66+i*34));}
}
let playing=!matchMedia('(prefers-reduced-motion: reduce)').matches,elapsed=0,previous;
function animate(now){if(previous!==undefined&&playing&&!document.hidden)elapsed+=(now-previous)/1000;previous=now;draw(elapsed);requestAnimationFrame(animate);}
const play=document.querySelector('#play');play.textContent=playing?'Pause':'Play';
play.onclick=()=>{playing=!playing;play.textContent=playing?'Pause':'Play';};
const strength=document.querySelector('#strength');
strength.oninput=()=>{settings.strength=Number(strength.value)/100;document.querySelector('output').textContent=strength.value+'%';};
document.querySelector('#terminal').onclick=()=>{strength.value=18;strength.oninput();};
for(const key of ['rain','clouds','water','lights','text'])document.querySelector('#'+key).onchange=e=>{settings[key]=e.target.checked;};
document.querySelector('#waterMode').onchange=e=>{settings.waterMode=e.target.value;};
window.cityPreview={draw,settings,loop:LOOP,cloudX,houseIsLit,pause:()=>{playing=false;play.textContent='Play';}};
window.ready=Promise.all([base.decode(),clouds.decode(),waterArt.decode()]).then(()=>{prepareWater();prepareHouses();draw(0);requestAnimationFrame(animate);});
