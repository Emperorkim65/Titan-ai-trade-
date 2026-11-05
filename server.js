const express = require("express");
const WebSocket = require("ws");
const crypto = require("crypto");
const path = require("path");

const app = express();
app.use(express.json({ limit: "32kb" }));
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 10000;
const DERIV_APP_ID = process.env.DERIV_APP_ID || "1089";
const WEBHOOK_SECRET = process.env.TRADINGVIEW_WEBHOOK_SECRET || "";
const ALLOWED_SYMBOLS = new Set([
  "R_10","R_25","R_ เพราะ","R_50","R_75","R_100",
  "1HZ10V","1HZ25V","1HZ50V","1HZ75V","1HZ100V",
  "BOOM1000","BOOM500","CRASH1000","CRASH500"
].filter(Boolean));

const rate = new Map();
app.use("/api", (req, res, next) => {
  const key = req.ip || "unknown";
  const now = Date.now();
  const item = rate.get(key) || { start: now, count: 0 };
  if (now - item.start > 60000) { item.start = now; item.count = 0; }
  item.count++;
  rate.set(key, item);
  if (item.count > 50) return res.status(429).json({ error: "Too many requests. Try again shortly." });
  next();
});

function derivRequest(payload) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${encodeURIComponent(DERIV_APP_ID)}`);
    const timer = setTimeout(() => { ws.terminate(); reject(new Error("Deriv market data timed out")); }, 12000);
    ws.on("open", () => ws.send(JSON.stringify(payload)));
    ws.on("message", raw => {
      let data;
      try { data = JSON.parse(raw.toString()); } catch { return; }
      if (data.error) { clearTimeout(timer); ws.close(); reject(new Error(data.error.message || "Deriv API error")); }
      else if (data.candles) { clearTimeout(timer); ws.close(); resolve(data.candles); }
    });
    ws.on("unexpected-response", (_request, response) => {
      clearTimeout(timer);
      const status = response.statusCode || "unknown";
      response.resume();
      reject(new Error("Deriv WebSocket handshake failed (HTTP " + status + "). Check the Deriv App ID and Deriv service availability."));
    });
    ws.on("error", err => { clearTimeout(timer); reject(new Error("Deriv WebSocket connection error: " + err.message)); });
  });
}

function ema(values, period) {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let value = values.slice(0, period).reduce((a,b) => a+b, 0) / period;
  for (let i = period; i < values.length; i++) value = values[i] * k + value * (1-k);
  return value;
}
function rsi(values, period=14) {
  if (values.length <= period) return null;
  let gains=0, losses=0;
  for (let i=1; i<=period; i++) {
    const d=values[i]-values[i-1]; if(d>0) gains+=d; else losses-=d;
  }
  let avgGain=gains/period, avgLoss=losses/period;
  for(let i=period+1;i<values.length;i++){
    const d=values[i]-values[i-1];
    avgGain=(avgGain*(period-1)+Math.max(d,0))/period;
    avgLoss=(avgLoss*(period-1)+Math.max(-d,0))/period;
  }
  if(avgLoss===0) return 100;
  return 100-(100/(1+avgGain/avgLoss));
}
function atr(candles, period=14) {
  if(candles.length <= period) return null;
  const tr=[];
  for(let i=1;i<candles.length;i++){
    const c=candles[i], p=candles[i-1];
    tr.push(Math.max(c.high-c.low, Math.abs(c.high-p.close), Math.abs(c.low-p.close)));
  }
  return tr.slice(-period).reduce((a,b)=>a+b,0)/period;
}
function analyze(candles) {
  const closes=candles.map(c=>Number(c.close));
  const fast=ema(closes,9), mid=ema(closes,21), slow=ema(closes,50);
  const current=closes[closes.length-1], strength=rsi(closes), volatility=atr(candles);
  if([fast,mid,slow,strength,volatility,current].some(v=>v===null || !Number.isFinite(v))) {
    throw new Error("Not enough valid candle data to calculate the signal");
  }
  let signal="WAIT", reason="Trend or momentum confirmation is incomplete.";
  if(fast>mid && mid>slow && current>fast && strength>=52 && strength<=72) {
    signal="BUY"; reason="EMA alignment is bullish and RSI confirms upward momentum.";
  } else if(fast<mid && mid<slow && current<fast && strength>=28 && strength<=48) {
    signal="SELL"; reason="EMA alignment is bearish and RSI confirms downward momentum.";
  }
  const risk=volatility*1.5;
  const entry=current;
  const sl=signal==="BUY"?entry-risk:signal==="SELL"?entry+risk:null;
  const direction=signal==="BUY"?1:signal==="SELL"?-1:0;
  return {
    signal, symbol:null, entry:round(entry), stopLoss:sl===null?null:round(sl),
    takeProfits:direction?[round(entry+direction*risk),round(entry+direction*risk*2),round(entry+direction*risk*3)]:[],
    rsi:round(strength), ema9:round(fast), ema21:round(mid), ema50:round(slow),
    atr:round(volatility), reason,
    invalidation: signal==="BUY"?"A candle close below EMA21 weakens this setup.":signal==="SELL"?"A candle close above EMA21 weakens this setup.":"Wait for clear trend and momentum alignment.",
    candleTime:candles[candles.length-1].epoch
  };
}
function round(n){ return Number(Number(n).toPrecision(8)); }

app.get("/api/health", (_req,res)=>res.json({ ok:true, service:"TITAN AI TRADER", dataSource:"Deriv public market candles", mode:"analysis-only" }));
app.get("/api/config", (_req,res)=>res.json({ symbols:["R_10","R_25","R_50","R_75","R_100","1HZ10V","1HZ25V","1HZ50V","1HZ75V","1HZ100V","BOOM1000","BOOM500","CRASH1000","CRASH500"], timeframes:[60,300,900,3600], execution:false }));
app.get("/api/analyze", async (req,res)=>{
  const symbol=String(req.query.symbol || "R_100");
  const granularity=Number(req.query.granularity || 60);
  if(!/^[A-Z0-9_]{2,24}$/.test(symbol)) return res.status(400).json({error:"Invalid symbol"});
  if(![60,300,900,3600].includes(granularity)) return res.status(400).json({error:"Unsupported timeframe"});
  try {
    const candles=await derivRequest({ ticks_history:symbol, adjust_start_time:1, count:150, end:"latest", granularity, style:"candles" });
    const result=analyze(candles);
    result.symbol=symbol; result.timeframe=granularity;
    res.json(result);
  } catch(e) { res.status(502).json({error:e.message || "Unable to retrieve market data"}); }
});
app.post("/webhook/tradingview", (req,res)=>{
  if(!WEBHOOK_SECRET) return res.status(503).json({error:"Webhook secret is not configured"});
  const supplied=req.get("x-titan-secret") || "";
  const a=Buffer.from(supplied), b=Buffer.from(WEBHOOK_SECRET);
  if(a.length!==b.length || !crypto.timingSafeEqual(a,b)) return res.status(401).json({error:"Unauthorized"});
  const body=req.body || {};
  console.log("Verified TradingView alert received:", JSON.stringify({
    symbol:String(body.symbol || "").slice(0,30),
    action:String(body.action || body.signal || "").slice(0,12),
    time:Date.now()
  }));
  res.json({received:true, execution:false, message:"Alert received for analysis/logging only"});
});
app.get("*", (req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,()=>console.log(`TITAN AI TRADER listening on ${PORT}`));