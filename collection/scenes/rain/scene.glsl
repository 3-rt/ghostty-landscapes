const vec2 ART_SIZE=vec2(1672.,941.);
const float TAU=6.28318530718;
float wrap(float x,float n){return mod(mod(x,n)+n,n);}
float lineAA(float d,float radius,float aa){return 1.-smoothstep(max(0.,radius-aa),radius+aa,d);}
void ink(inout vec3 color,vec3 pigment,float coverage,float alpha){color=mix(color,pigment*alpha,clamp(coverage,0.,1.));}
float riverTop(float x){return x<961.?577.:mix(594.,597.,(x-961.)/711.);}
void mainImage(out vec4 fragColor,in vec2 fragCoord){
 vec2 uv=fragCoord/iResolution.xy;
 vec4 original=texture(iChannel0,uv);
 fragColor=original;
 // Read only this destination pixel. Never resample or displace terminal content.
 // Fail closed if opacity changed or an app painted this cell opaque.
 if(STRENGTH<=0. || BG_ALPHA>=.999 || abs(original.a-BG_ALPHA)>.0015)return;
 float scale=max(iResolution.x/ART_SIZE.x,iResolution.y/ART_SIZE.y);
 vec2 offset=(iResolution.xy-ART_SIZE*scale)*.5;
 // Ghostty Metal uses a top-left fragment origin (custom_shader_y_is_down).
 vec2 p=(fragCoord-offset)/scale;
 if(any(lessThan(p,vec2(0)))||any(greaterThanEqual(p,ART_SIZE)))return;
 float t=mod(iTime,192.);
 float aa=max(.3,.6/scale);
 vec3 color=original.rgb;
 if(p.y<350.){
  float x=wrap(p.x-t*1672./192.,1672.);
  float xNear=wrap(p.x-t*1672./96.-705.,1672.);
  float clouds=cloud0(vec2(x,p.y-20.));
  clouds=1.-(1.-clouds)*(1.-cloud1(vec2(xNear,p.y-195.)));
  clouds=1.-(1.-clouds)*(1.-cloud2(vec2(wrap(x-1015.,1672.),p.y-5.)));
  ink(color,vec3(201,194,220)/255.,clouds*min(1.,STRENGTH*2.4),original.a);
 }
 if(p.y>=riverTop(p.x)){
  float x=wrap(p.x-t*1672./192.,1672.);
  float y=p.y<741.?(p.y-577.)*200./164.:p.y-741.;
  float sourceX=wrap(x+(p.y<741.?418.:0.),836.);
  float current=waterInk(vec2(sourceX,y))*(.6+.4*(p.y-577.)/364.);
  ink(color,vec3(224,217,241)/255.,current*STRENGTH,original.a);
  int lo=clamp(int(floor((p.x-22.)/64.)),0,26);
  int hi=clamp(int(floor((p.x+22.)/64.))+1,0,27);
  for(int i=ringDataOffsets[lo];i<ringDataOffsets[hi];i++){
   vec4 r=ringData[i];float age=fract(t/r.w+r.z);
   vec2 radius=vec2(3.+age*17.,1.+age*2.);
   vec2 d=p-r.xy;
   if(any(greaterThan(abs(d),radius+aa)))continue;
   float ring=lineAA(abs(length(d/radius)-1.)*radius.y,.5,aa);
   float angle=atan(d.y/radius.y,d.x/radius.x);
   float dash=1.-smoothstep(1.6,2.4,mod((angle+TAU)*radius.x,5.));
   ink(color,vec3(217,208,231)/255.,ring*dash*pow(sin(3.14159265359*age),2.)*.85*STRENGTH,original.a);
  }
 }
 if(p.y>509. && p.y<562.){
  const vec2 lamps[10]=vec2[10](vec2(124,522),vec2(286,527),vec2(368,533),vec2(984,549),vec2(1041,540),vec2(1128,541),vec2(1207,539),vec2(1330,536),vec2(1465,535),vec2(1544,529));
  for(int i=0;i<10;i++){
   float d=length(p-lamps[i]);if(d>12.+aa)continue;
   float gain=pow(STRENGTH,.6)*.9;
   ink(color,vec3(242,229,251)/255.,lineAA(d,3.1,aa)*gain,original.a);
   ink(color,vec3(238,216,255)/255.,max(0.,1.-max(d-2.,0.)/10.)*.35*gain,original.a);
  }
 }
 float window=0.;
 if(mod(t+42.,96.)<48.)window=max(window0(p-vec2(1232,525)),window1(p-vec2(1242,524)));
 if(mod(t+30.,96.)<48.)window=max(window,max(window2(p-vec2(1289,530)),window3(p-vec2(1299,530))));
 if(mod(t+18.,96.)<48.)window=max(window,max(window4(p-vec2(1420,531)),window5(p-vec2(1430,531))));
 if(mod(t+6.,96.)<48.)window=max(window,max(window6(p-vec2(1544,495)),window7(p-vec2(1557,494))));
 ink(color,vec3(240,234,250)/255.,window*pow(STRENGTH,.7),original.a);
 float lane=p.x+(p.y-470.)*.32;
 int lo=clamp(int(floor((lane+110.-2.)/50.)),0,37);
 int hi=clamp(int(floor((lane+110.+2.)/50.))+1,0,38);
 for(int i=rainDataOffsets[lo];i<rainDataOffsets[hi];i++){
  vec4 r=rainData[i];float age=fract(t/r.z+r.y);
  float y=age*1021.-40.;float dy=p.y-y;
  if(dy< -aa || dy>r.w+aa)continue;
  float line=lineAA(abs(lane-r.x)/1.05,.5,aa);
  float ends=smoothstep(-aa,aa,dy)*(1.-smoothstep(r.w-aa,r.w+aa,dy));
  float dash=1.-smoothstep(1.6,2.4,mod(dy*1.05,5.));
  float fade=min(1.,min(age*30.,(1.-age)*30.));
  ink(color,vec3(181,174,203)/255.,line*ends*dash*rainAlpha[i]*fade*STRENGTH*1.8,original.a);
 }
 fragColor=vec4(color,original.a);
}
