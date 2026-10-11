export type ContextMedia={name:string;kind:'image'|'pdf'|'text'|'video';media_type:string;data_base64?:string;text?:string;frames?:{timestamp_s:number;data_base64:string}[]};
const base64=(file:File)=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve((reader.result as string).split(',')[1]);reader.onerror=()=>reject(new Error('Could not read this file.'));reader.readAsDataURL(file);});
export async function prepareMedia(file:File):Promise<ContextMedia> {
  const name=file.name.slice(0,200),type=file.type;
  if(['image/png','image/jpeg','image/webp','image/gif'].includes(type)){if(file.size>5_000_000)throw new Error('Images must be under 5 MB.');return {name,kind:'image',media_type:type,data_base64:await base64(file)};}
  if(type==='application/pdf'||/\.pdf$/i.test(name)){if(file.size>10_000_000)throw new Error('PDFs must be under 10 MB.');return {name,kind:'pdf',media_type:'application/pdf',data_base64:await base64(file)};}
  if(/\.(txt|md|csv|json)$/i.test(name)||type.startsWith('text/')){if(file.size>300_000)throw new Error('Text documents must be under 300 KB.');return {name,kind:'text',media_type:'text/plain',text:await file.text()};}
  if(type.startsWith('video/')||/\.(mp4|webm|mov)$/i.test(name)){
    if(file.size>80_000_000)throw new Error('Videos must be under 80 MB.');
    const video=document.createElement('video'),url=URL.createObjectURL(file);video.muted=true;video.preload='auto';video.src=url;
    try{
      await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('This video could not be decoded. Try MP4/WebM or upload screenshots.')),12000);video.onloadedmetadata=()=>{clearTimeout(timer);resolve();};video.onerror=()=>{clearTimeout(timer);reject(new Error('This browser cannot decode that video.'));};});
      if(!Number.isFinite(video.duration)||video.duration<=0)throw new Error('The video has no readable duration.');
      const canvas=document.createElement('canvas'),scale=Math.min(1,1280/Math.max(video.videoWidth,video.videoHeight));canvas.width=Math.max(1,Math.round(video.videoWidth*scale));canvas.height=Math.max(1,Math.round(video.videoHeight*scale));const context=canvas.getContext('2d')!,frames=[];
      for(let i=0;i<6;i++){
        const timestamp=Math.min(video.duration-.01,video.duration*(i+.5)/6);
        await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Video frame extraction timed out.')),6000);video.onseeked=()=>{clearTimeout(timer);resolve();};video.currentTime=timestamp;});
        context.drawImage(video,0,0,canvas.width,canvas.height);frames.push({timestamp_s:timestamp,data_base64:canvas.toDataURL('image/jpeg',.76).split(',')[1]});
      }
      return {name,kind:'video',media_type:type||'video/mp4',frames};
    }finally{video.removeAttribute('src');video.load();URL.revokeObjectURL(url);}
  }
  throw new Error('Use PNG, JPEG, WebP, GIF, PDF, TXT, Markdown, CSV, JSON, or an MP4/WebM/MOV video.');
}
