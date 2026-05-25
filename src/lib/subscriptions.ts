import { promises as fs } from 'fs';
import path from 'path';
import type { PushSubscription } from 'web-push';

// Persist to /tmp which survives within a Vercel function instance lifetime.
// The client always re-POSTs its subscription on page load, so even after a
// cold start the subscription is re-registered before the next cron fires.
const FILE = path.join('/tmp', '4scans-subs.json');

async function load(): Promise<Map<string, PushSubscription>> {
  try {
    const raw = await fs.readFile(FILE, 'utf8');
    const arr = JSON.parse(raw) as PushSubscription[];
    return new Map(arr.map(s => [s.endpoint, s]));
  } catch {
    return new Map();
  }
}

async function save(map: Map<string, PushSubscription>) {
  await fs.writeFile(FILE, JSON.stringify(Array.from(map.values())), 'utf8');
}

export async function addSubscription(sub: PushSubscription) {
  const map = await load();
  map.set(sub.endpoint, sub);
  await save(map);
}

export async function removeSubscription(endpoint: string) {
  const map = await load();
  map.delete(endpoint);
  await save(map);
}

export async function getAllSubscriptions(): Promise<PushSubscription[]> {
  const map = await load();
  return Array.from(map.values());
}
