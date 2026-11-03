import type { WireRecord } from './syncClient';

export type CachedFamily={records:WireRecord[];cursor:number;savedAt:number};
export interface FamilyCache {
  read(scope:string):Promise<CachedFamily|undefined>;
  write(scope:string,value:CachedFamily):Promise<void>;
  image(scope:string,ref:string):Promise<string|undefined>;
  saveImage(scope:string,ref:string,value:string):Promise<void>;
}

// IndexedDB avoids the small localStorage quota for photos and large families.
export class BrowserFamilyCache implements FamilyCache {
  private db?:Promise<IDBDatabase>;
  private open(){
    return this.db??=new Promise<IDBDatabase>((resolve,reject)=>{
      const request=indexedDB.open('habit-hero-family-cache-v1',1);
      request.onupgradeneeded=()=>{request.result.createObjectStore('families');request.result.createObjectStore('images');};
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
  }
  private async get<T>(store:string,key:string):Promise<T|undefined>{
    const db=await this.open();return new Promise((resolve,reject)=>{
      const tx=db.transaction(store,'readonly'),req=tx.objectStore(store).get(key);
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
  }
  private async put(store:string,key:string,value:unknown){
    const db=await this.open();await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(value,key);
      tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
    });
  }
  read(scope:string){return this.get<CachedFamily>('families',scope);}
  write(scope:string,value:CachedFamily){return this.put('families',scope,value);}
  image(scope:string,ref:string){return this.get<string>('images',`${scope}:${ref}`);}
  saveImage(scope:string,ref:string,value:string){return this.put('images',`${scope}:${ref}`,value);}
}
