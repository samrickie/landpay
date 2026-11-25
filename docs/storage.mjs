const database = new Promise((resolve, reject) => {
  const request = indexedDB.open('landpay', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('tracker');
  request.onsuccess = () => {
    request.result.onversionchange = () => request.result.close();
    resolve(request.result);
  };
  request.onerror = () => reject(request.error);
});
export async function read() {
  const db = await database;
  return new Promise((resolve,reject) => {
    const request = db.transaction('tracker').objectStore('tracker').get('data');
    request.onsuccess = () => resolve(request.result || { plan:null, payments:[], revision:0 });
    request.onerror = () => reject(request.error);
  });
}
export async function write(data, revision) {
  const db = await database;
  return new Promise((resolve,reject) => {
    const transaction = db.transaction('tracker','readwrite');
    const store = transaction.objectStore('tracker');
    const request = store.get('data');
    let conflict = false;
    request.onsuccess = () => {
      if ((request.result?.revision || 0) !== revision) {
        conflict = true;
        transaction.abort();
        return;
      }
      store.put({...data,revision:revision+1},'data');
    };
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(conflict ? Error('LandPay changed in another tab. Close the dialog and try again.') : transaction.error || Error('Storage update failed.'));
  });
}
const types = {
  'application/pdf': [37,80,68,70,45],
  'image/jpeg': [255,216,255],
  'image/png': [137,80,78,71,13,10,26,10]
};
export async function receipt(blob, name) {
  const signature = types[blob.type];
  if (!Array.isArray(signature) || blob.size > 15*1024*1024 || typeof name !== 'string' || !name || name.length > 255) throw Error('Choose a PDF, JPG or PNG receipt up to 15 MB.');
  const bytes = new Uint8Array(await blob.slice(0,signature.length).arrayBuffer());
  if (!signature.every((byte,index) => bytes[index] === byte)) throw Error('The receipt contents do not match its file type.');
  return { blob, name };
}
export function encode(blob) {
  return new Promise((resolve,reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
export function decode(type, content) {
  if (typeof content !== 'string' || content.length > 20*1024*1024) throw Error('Invalid receipt in backup.');
  return new Blob([Uint8Array.from(atob(content), char => char.charCodeAt(0))],{type});
}

