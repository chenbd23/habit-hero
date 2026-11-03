import { BrowserFamilyCache } from './familyCache';
import { SyncClient } from './syncClient.ts';
export const syncClient = new SyncClient({legacyCredentials:sessionStorage,backgroundImages:true,cache:new BrowserFamilyCache()});

export async function exportDataToFile() {
  const data=await syncClient.exportFamily();
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download=`习惯小英雄家庭备份-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
