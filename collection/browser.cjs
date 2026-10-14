const fs=require('node:fs');
module.exports=()=>{
 const chrome=process.env.GHOST_BG_BROWSER||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
 return {headless:true,...(fs.existsSync(chrome)?{executablePath:chrome}:{})};
};
