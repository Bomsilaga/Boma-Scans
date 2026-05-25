// In-memory subscription store.
// On Vercel, each serverless function instance has its own memory.
// For persistence across instances use Vercel KV — but for a single-user
// app this works fine because the client re-subscribes on every page load.
import type { PushSubscription } from 'web-push';

const subs = new Map<string, PushSubscription>();

export function addSubscription(sub: PushSubscription) {
  const key = sub.endpoint;
  subs.set(key, sub);
}

export function removeSubscription(endpoint: string) {
  subs.delete(endpoint);
}

export function getAllSubscriptions(): PushSubscription[] {
  return Array.from(subs.values());
}
