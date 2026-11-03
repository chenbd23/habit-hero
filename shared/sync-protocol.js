// Wire protocol v1. Pure functions shared by the server and Android client.
export const PROTOCOL = 1;
export const KINDS = ["profiles", "habits", "rewards", "transactions", "pendingTasks", "quickActions", "quizQuestions", "literacyProgresses", "literacyNotebookEntries", "achievementAwards", "achievementTemplates", "habitChallenges", "challengeCheckIns", "ownedPokemons", "ownedItems", "pokemonItems", "pokemonSpecies", "runtime"];
export const clone = value => JSON.parse(JSON.stringify(value));
export function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stable(value[k])}`).join(",")}}`;
}
export const equal = (a, b) => stable(a ?? null) === stable(b ?? null);
export const keyOf = r => `${r.childId}/${r.kind}/${r.id}`;
export const points = t => t.type === "earn" ? Math.abs(t.amount) : t.type === "spend" ? -Math.abs(t.amount) : t.amount;
export function recordsMap(records) { return Object.fromEntries(records.map(r => [keyOf(r), r])); }
export function delta(before, after, revisions = {}) {
  const changes = [];
  for (const key of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
    const a = before[key], b = after[key];
    if (!a && b) changes.push({action:"create", record:clone(b), baseVersion:0});
    else if (a && !b && a.kind === "ownedItems") { if (a.fields.count !== 0) changes.push({action:"patch", key, baseVersion:revisions[key] ?? 0, before:{count:a.fields.count}, set:{count:0}}); }
    else if (a && !b) changes.push({action:"delete", key, baseVersion:revisions[key] ?? 0, before:clone(a.fields)});
    else {
      const set = {}, old = {};
      for (const field of [...new Set([...Object.keys(a.fields), ...Object.keys(b.fields)])].sort()) {
        if (a.kind === "profiles" && field === "totalPoints") continue;
        if (!equal(a.fields[field], b.fields[field])) { set[field] = b.fields[field] ?? null; old[field] = a.fields[field] ?? null; }
      }
      if (Object.keys(set).length) changes.push({action:"patch", key, baseVersion:revisions[key] ?? 0, before:old, set});
    }
  }
  return changes;
}
export function applyOptimistic(records, changes) {
  const next = clone(records);
  for (const c of changes) {
    if (c.action === "create") next[keyOf(c.record)] = clone(c.record);
    else if (c.action === "delete") delete next[c.key];
    else if (next[c.key]) Object.assign(next[c.key].fields, clone(c.set));
  }
  return next;
}
export function hasConsumption(changes, before) {
  return changes.some(c => {
    if (c.action === "create" && c.record.kind === "transactions") return points(c.record.fields) < 0;
    const r = before[c.key];
    if (r?.kind === "ownedItems") return c.action === "delete" || Number(c.set?.count ?? r.fields.count) < r.fields.count;
    return r?.kind === "profiles" && c.set?.challengeMakeupCardBalance != null && c.set.challengeMakeupCardBalance < r.fields.challengeMakeupCardBalance;
  });
}
// Replaying pending edits must not execute business side effects.
export function project(confirmed, operations, conflicts = []) {
  let result = clone(confirmed);
  const blocked = new Set(conflicts.map(x => x.operation.operationId));
  for (const operation of operations) {
    if (blocked.has(operation.operationId)) continue;
    result = applyOptimistic(result, operation.changes);
  }
  return result;
}
