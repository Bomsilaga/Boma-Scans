import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const BYBIT_BASE = process.env.BYBIT_TESTNET === 'true'
  ? 'https://api-testnet.bybit.com'
  : 'https://api.bybit.com';

const API_KEY    = process.env.BYBIT_API_KEY    ?? '';
const API_SECRET = process.env.BYBIT_API_SECRET ?? '';
const PAPER_MODE = process.env.TRADING_MODE !== 'live';

function sign(params: Record<string, string | number>, timestamp: number): string {
  const ordered = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&');
  const payload = `${timestamp}${API_KEY}5000${ordered}`;
  return crypto.createHmac('sha256', API_SECRET).update(payload).digest('hex');
}

async function bybitRequest(method: 'GET' | 'POST', path: string, body: Record<string, string | number> = {}) {
  const ts = Date.now();
  const sig = sign(body, ts);
  const res = await fetch(`${BYBIT_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-BAPI-API-KEY': API_KEY,
      'X-BAPI-TIMESTAMP': String(ts),
      'X-BAPI-SIGN': sig,
      'X-BAPI-RECV-WINDOW': '5000',
    },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  return res.json();
}

export interface TradeRequest {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  leverage: number;
  riskPct: number;      // % of account to risk e.g. 1
  style: string;
}

export async function POST(req: NextRequest) {
  try {
    const body: TradeRequest = await req.json();
    const { symbol, direction, entry, stopLoss, tp1, tp2, tp3, leverage, riskPct } = body;

    if (!API_KEY || !API_SECRET) {
      return NextResponse.json({ error: 'Bybit API keys not configured' }, { status: 500 });
    }

    // Paper mode — just validate and return simulated response
    if (PAPER_MODE) {
      return NextResponse.json({
        paper: true,
        message: '📄 PAPER MODE — no real order placed',
        simulated: { symbol, direction, entry, stopLoss, tp1, tp2, tp3, leverage, riskPct },
      });
    }

    const side = direction === 'LONG' ? 'Buy' : 'Sell';

    // 1. Set leverage
    await bybitRequest('POST', '/v5/position/set-leverage', {
      category: 'linear',
      symbol,
      buyLeverage: String(leverage),
      sellLeverage: String(leverage),
    });

    // 2. Get account balance to calculate qty
    const walletRes = await bybitRequest('GET', '/v5/account/wallet-balance?accountType=UNIFIED', {});
    const coins = walletRes?.result?.list?.[0]?.coin ?? [];
    const usdtCoin = (coins as Record<string, string>[]).find((c) => c.coin === 'USDT');
    const balance = parseFloat(usdtCoin?.availableToWithdraw ?? '0');
    if (balance === 0) return NextResponse.json({ error: 'No USDT balance found' }, { status: 400 });

    const riskAmt = balance * (riskPct / 100);
    const slDist  = Math.abs(entry - stopLoss);
    const rawQty  = (riskAmt * leverage) / entry;
    const qty     = Math.max(0.001, parseFloat(rawQty.toFixed(3)));

    // 3. Place market order with SL and TP1
    const orderRes = await bybitRequest('POST', '/v5/order/create', {
      category:       'linear',
      symbol,
      side,
      orderType:      'Market',
      qty:            String(qty),
      stopLoss:       String(stopLoss.toFixed(5)),
      takeProfit:     String(tp1.toFixed(5)),
      tpslMode:       'Full',
      slTriggerBy:    'LastPrice',
      tpTriggerBy:    'LastPrice',
      timeInForce:    'GoodTillCancel',
      positionIdx:    0,
    });

    if (orderRes.retCode !== 0) {
      return NextResponse.json({ error: `Bybit order error: ${orderRes.retMsg}` }, { status: 400 });
    }

    const orderId = orderRes.result?.orderId;

    // 4. Place TP2 and TP3 as limit reduce-only orders (25% each)
    const tpQty2 = parseFloat((qty * 0.25).toFixed(3));
    const tpQty3 = parseFloat((qty * 0.25).toFixed(3));
    const tpSide = direction === 'LONG' ? 'Sell' : 'Buy';

    await Promise.allSettled([
      bybitRequest('POST', '/v5/order/create', {
        category: 'linear', symbol, side: tpSide,
        orderType: 'Limit', qty: String(tpQty2),
        price: String(tp2.toFixed(5)),
        reduceOnly: 'true', timeInForce: 'GoodTillCancel', positionIdx: 0,
      }),
      bybitRequest('POST', '/v5/order/create', {
        category: 'linear', symbol, side: tpSide,
        orderType: 'Limit', qty: String(tpQty3),
        price: String(tp3.toFixed(5)),
        reduceOnly: 'true', timeInForce: 'GoodTillCancel', positionIdx: 0,
      }),
    ]);

    return NextResponse.json({
      success: true,
      orderId,
      symbol, direction, qty, leverage,
      entry, stopLoss, tp1, tp2, tp3,
      balance: balance.toFixed(2),
      riskAmt: riskAmt.toFixed(2),
      slDist: slDist.toFixed(5),
      message: `✅ Order placed — ${qty} ${symbol} ${direction} @ market`,
    });

  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
