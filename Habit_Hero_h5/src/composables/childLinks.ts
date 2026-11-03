// Family and child IDs make bookmarks independent of the last selected profile.
export function childLink(kind:'kid'|'parent',familyId:string,childId:string){
  return `/${kind}/${encodeURIComponent(familyId)}/${encodeURIComponent(childId)}`;
}
