// Device-local media library. Files never leave the browser through this module.
function database(){return new Promise((resolve,reject)=>{const r=indexedDB.open('haggsfield-footage',1);r.onupgradeneeded=()=>r.result.createObjectStore('files');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('Local media storage is unavailable.'));});}
export async function saveMedia(id,file){const db=await database();try{await new Promise((resolve,reject)=>{const t=db.transaction('files','readwrite');t.objectStore('files').put(file,id);t.oncomplete=resolve;t.onerror=()=>reject(Error('Your device has insufficient storage. Keep the original file for relinking.'));t.onabort=t.onerror;});}finally{db.close();}}
export async function restoreMedia(ids){const db=await database();try{return await Promise.all([...new Set(ids)].map(id=>new Promise((resolve,reject)=>{const r=db.transaction('files').objectStore('files').get(id);r.onsuccess=()=>resolve([id,r.result]);r.onerror=()=>reject(Error('Could not restore local footage.'));})));}finally{db.close();}}
// Canvas data URLs are local bytes, not network requests. fetch(data:) is
// blocked by the hosted connect-src policy; decode without weakening CSP.
export async function mediaBlob(url){
 if(typeof url!=='string')throw Error('Media source is unavailable.');
 if(url.startsWith('data:')){
  const m=/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(url);
  if(!m)throw Error('Unsupported embedded image.');
  const raw=atob(m[2]),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));return new Blob([bytes],{type:m[1]});
 }
 const response=await fetch(url);if(!response.ok)throw Error('Media could not load. Relink the original file.');return response.blob();
}
