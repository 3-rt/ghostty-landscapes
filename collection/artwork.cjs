// Browser-side asset preparation. Generative edits are limited to owned regions;
// all other pixels come directly from the archived original.
module.exports=async function prepareArtwork({scene,originalURL,cleanURL}){
 const W=1672,H=941,make=(w=W,h=H)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
 const read=async url=>{const i=new Image();i.src=url;await i.decode();if(Math.abs(i.width/i.height-W/H)>.02)throw Error('Artwork aspect ratio changed');const c=make(),x=c.getContext('2d');x.fillStyle='#232136';x.fillRect(0,0,W,H);x.drawImage(i,0,0,W,H);return x.getImageData(0,0,W,H);};
 const original=await read(originalURL),clean=await read(cleanURL),base=new ImageData(new Uint8ClampedArray(original.data),W,H);
 const layers=[],owned=new Uint8Array(W*H),at=(x,y)=>(y*W+x)*4;
 const inside=(x,y,poly)=>{let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};
 function replace(x,y,amount=1){if(x<0||y<0||x>=W||y>=H)return;const i=at(x,y);for(let j=0;j<3;j++)base.data[i+j]=Math.round(base.data[i+j]*(1-amount)+clean.data[i+j]*amount);owned[y*W+x]=1;}
 function layer(kind,rect,meta={},predicate=()=>true,difference=true){
  const [rx,ry,w,h]=rect,v=[];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const px=rx+x,py=ry+y,i=at(px,py),allowed=predicate(px,py);
   const old=original.data[i],under=clean.data[i];
   const coverage=allowed?Math.max(0,Math.min(1,difference?(old-under)/Math.max(80,224-under):(old-38)/186)):0;
   v.push(Math.round(coverage*15)/15);
   // Keep the original dark backdrop so edited rectangles have no visible edge.
   if(allowed && (!difference || coverage>0))replace(px,py);
  }
  const l={kind,rect,...meta,v};layers.push(l);return l;
 }
 const cloudSky=(x,y)=>{if(!scene.cloudCeiling)return true;const points=scene.cloudCeiling;for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i];if(x<=b[0])return y<a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]);}return y<points.at(-1)[1];};
 (scene.clouds||[]).forEach(rect=>layer('cloud',rect,{},cloudSky));
 for(const boat of scene.boats||[])layer('boat',boat.rect,boat);
 for(const frond of scene.fronds||[])layer('frond',frond.rect,frond);
 for(const grass of scene.grass||[]){
  const [cx,cy]=grass.pivot;let best=Infinity,px=cx,py=cy;
  for(let yy=cy-55;yy<=cy+55;yy++)for(let xx=cx-85;xx<=cx+85;xx++){if(original.data[at(xx,yy)]<110)continue;const distance=(xx-cx)**2+(yy-cy)**2;if(distance<best){best=distance;px=xx;py=yy;}}
  const rect=[px-15,py-8,31,17],g={...grass,rect,pivot:[px,py+8]};layer('grass',rect,g,()=>true,false);
  for(let yy=rect[1];yy<rect[1]+rect[3];yy++)for(let xx=rect[0];xx<rect[0]+rect[2];xx++){
   const i=at(xx,yy);let dark=at(xx,yy);for(let oy=-3;oy<=3;oy++)for(let ox=-3;ox<=3;ox++){const j=at(xx+ox,yy+oy);if(original.data[j]<original.data[dark])dark=j;}for(let k=0;k<3;k++)base.data[i+k]=original.data[dark+k];
  }
 }
 if(scene.rotor){const r=scene.rotor;layer('rotor',r.rect,r,(x,y)=>{const dx=x-r.pivot[0],dy=y-r.pivot[1],u=(dx+dy)*Math.SQRT1_2,v=(dx-dy)*Math.SQRT1_2;return (Math.abs(u)<8&&Math.abs(v)<58)||(Math.abs(v)<8&&Math.abs(u)<58);});}
 for(let n=0;n<(scene.stars||[]).length;n++){const [cx,cy]=scene.stars[n];let x=cx,y=cy,best=0;for(let yy=cy-30;yy<=cy+30;yy++)for(let xx=cx-30;xx<=cx+30;xx++){const value=original.data[at(xx,yy)];if(value>best){best=value;x=xx;y=yy;}}layer('star',[x-5,y-5,11,11],{period:[12,16,24][n%3],phase:n*.173});}
 // Isolated leaf outlines are large connected components, unlike the tiny
 // disconnected marks forming land. The density guard excludes scenery.
 const removed=[];
 if(scene.leaves||scene.snow){
  const visited=new Uint8Array(W*H),d=original.data;
  for(let y=5;y<H-5;y++)for(let x=5;x<W-5;x++){
   const idx=y*W+x;if(visited[idx]||d[idx*4]<110)continue;
   const queue=[idx];visited[idx]=1;let minX=x,maxX=x,minY=y,maxY=y;
   for(let q=0;q<queue.length;q++){const p=queue[q],px=p%W,py=Math.floor(p/W);minX=Math.min(minX,px);maxX=Math.max(maxX,px);minY=Math.min(minY,py);maxY=Math.max(maxY,py);for(const step of [-W-1,-W,-W+1,-1,1,W-1,W,W+1]){const k=p+step;if(k<0||k>=W*H||visited[k]||d[k*4]<110)continue;visited[k]=1;queue.push(k);}}
   const w=maxX-minX+1,h=maxY-minY+1;
   let remove=false;
   if(scene.leaves&&w>=8&&h>=7&&w<=32&&h<=28&&queue.length>=14){let near=0;for(let yy=Math.max(0,minY-12);yy<Math.min(H,maxY+13);yy++)for(let xx=Math.max(0,minX-12);xx<Math.min(W,maxX+13);xx++)if(d[at(xx,yy)]>100)near++;remove=near<queue.length+38;}
   if(scene.snow&&maxY<680&&w<=6&&h<=7&&queue.length<=18){let near=0;for(let yy=Math.max(0,minY-12);yy<Math.min(H,maxY+13);yy++)for(let xx=Math.max(0,minX-12);xx<Math.min(W,maxX+13);xx++)if(d[at(xx,yy)]>100)near++;remove=near<30;}
   if(remove){const rect=[Math.max(0,minX-2),Math.max(0,minY-2),w+4,h+4];removed.push(rect);for(let yy=rect[1];yy<rect[1]+rect[3];yy++)for(let xx=rect[0];xx<rect[0]+rect[2];xx++)replace(xx,yy);}
  }
 }
 if(scene.leaves){
  const leafCenters=[[90,113],[233,175],[650,114],[850,129],[1145,174],[1260,155],[1470,149],[119,242],[507,218],[901,244],[406,306],[650,292],[1144,319],[1385,347],[1565,305],[25,332],[262,366],[388,424],[624,423],[711,367],[1063,412],[1495,415],[1118,439],[812,469],[507,455],[447,550],[50,790],[272,795],[203,827],[80,860],[40,835],[383,866],[303,907],[406,878],[1344,776],[1415,857],[554,725],[505,697],[1545,912]];
  for(const [cx,cy] of leafCenters){const rect=[cx-14,cy-13,29,27];removed.push(rect);for(let yy=rect[1];yy<rect[1]+rect[3];yy++)for(let xx=rect[0];xx<rect[0]+rect[2];xx++)replace(xx,yy);}
  for(const rect of scene.leafSources){
  const [rx,ry,w,h]=rect,v=[];for(let y=0;y<h;y++)for(let x=0;x<w;x++)v.push(Math.round(Math.max(0,Math.min(1,(original.data[at(rx+x,ry+y)]-38)/186))*15)/15);
  layers.push({kind:'leaf',rect,v});
 }}
 for(const window of scene.windows||[]){const [x,y,w,h]=window.rect;const l=layer('window',window.rect,window,()=>true,false);for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++){const i=at(xx,yy);for(let c=0;c<3;c++)base.data[i+c]=[35,33,54][c];}l.gain=1.6;}
 if(scene.water){
  const [rx,ry,w,h]=scene.water.sample,v=[];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const px=rx+x,py=ry+y,excluded=removed.some(r=>px>=r[0]&&px<r[0]+r[2]&&py>=r[1]&&py<r[1]+r[3]);
   const fade=Math.min(1,x/14,(w-x-1)/14,y/6,(h-y-1)/6);
   v.push(Math.round(Math.max(0,Math.min(1,(original.data[at(px,py)]-38)/186))*Math.max(0,fade)*15)/15*(excluded?0:1));
  }
  layers.push({kind:'water',rect:[0,0,w,h],v});
  const reflections=scene.reflection?.regions||[];
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(inside(x,y,scene.water.top)&&original.data[at(x,y)]>clean.data[at(x,y)]+12&&!reflections.some(r=>x>=r[0]&&x<r[0]+r[2]&&y>=r[1]&&y<r[1]+r[3]))replace(x,y);
 }
 const c=make();c.getContext('2d').putImageData(base,0,0);
 let protectedPixels=0;for(let p=0;p<W*H;p++)if(!owned[p]){protectedPixels++;for(let k=0;k<4;k++)if(base.data[p*4+k]!==original.data[p*4+k])throw Error('Unowned scenery changed');}
 return {base:c.toDataURL().split(',')[1],layers,removed,protectedPixels};
};
