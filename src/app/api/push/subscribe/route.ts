import { NextRequest, NextResponse } from 'next/server';
import { addSubscription, removeSubscription } from '@/lib/subscriptions';
import type { PushSubscription } from 'web-push';

export async function POST(req: NextRequest) {
  const body = await req.json() as { subscription: PushSubscription };
  await addSubscription(body.subscription);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const body = await req.json() as { endpoint: string };
  await removeSubscription(body.endpoint);
  return NextResponse.json({ ok: true });
}
