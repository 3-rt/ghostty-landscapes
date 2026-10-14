const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=__dirname,manifest=require('./build/manifest.json');
for(const scene of manifest.scenes){
 const dir=path.join(root,'build',scene.id);fs.mkdirSync(dir,{recursive:true});
 const commands=[['glslangValidator',['-V','--target-env','vulkan1.2','-S','frag',path.join(root,'build',scene.id+'.frag'),'-o',path.join(dir,'check.spv')]],['spirv-cross',[path.join(dir,'check.spv'),'--msl','--msl-decoration-binding','--output',path.join(dir,'check.metal')]],['swift',[path.join(root,'check-metal.swift'),dir,path.join(root,'build',scene.base_file)]]];
 for(const [command,args] of commands){const result=spawnSync(command,args,{encoding:'utf8'});if(result.error)throw result.error;if(result.status)throw Error(scene.id+': '+result.stdout+result.stderr);if(command==='swift'){console.log(scene.id+': '+result.stdout);fs.writeFileSync(path.join(dir,'native-check.txt'),result.stdout);}}
}
