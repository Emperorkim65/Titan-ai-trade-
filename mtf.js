'use strict';
const { analyzeFractal, confirmsBalancedSignal } = require('./fractal');

function mean(a) { return a.reduce((s,v)=>s+v,0)/a.length; }
function ema(a,p) {
  if(a.length<p) return null;
  const k=2/(p+1); let v=mean(a.slice(0,p));
  for(let i=p;i<a.length;i++) v=a[i]*k+v*(1-k);
  return v;
}
function rsi(a,p=14) {
  if(a.length<=p) return null;
  let g=0,l=0;
  for(let i=1;i<=p;i++){const d=a[i]-a[i-1];if(d>0)g+=d;else l-=d;}
  g/=p;l/=p;
  for(let i=p+1;i<a.length;i++){const d=a[i]-a[i-1];g=(g*(p-1)+Math.max(d,0))/p;l=(l*(p-1)+Math.max(-d,0))/p;}
  return l===0?100:100-100/(1+g/l);
}
function analyzeTimeframe(candles) {
  if(!Array.isArray(candles)||candles.length<60) throw new Error('Each timeframe requires at least 60 candles');
  const closes=candles.map(c=>Number(c.close));
  if(closes.some(v=>!Number.isFinite(v)||v<=0)) throw new Error('Invalid candle close in timeframe data');
  const e9=ema(closes,9),e21=ema(closes,21),e50=ema(closes,50),momentum=rsi(closes);
  const fractal=analyzeFractal(candles.slice(-128));
  let direction='WAIT',reason='EMA structure or RSI confirmation is mixed';
  if(e9>e21&&e21>e50&&closes.at(-1)>e50&&momentum>=50&&momentum<=75) {
    direction='BUY';reason='Bullish EMA stack with positive momentum';
  } else if(e9<e21&&e21<e50&&closes.at(-1)<e50&&momentum>=25&&momentum<=50) {
    direction='SELL';reason='Bearish EMA stack with negative momentum';
  }
  const fractalConfirmed=direction!=='WAIT'&&confirmsBalancedSignal(direction,fractal);
  return {direction,reason,close:closes.at(-1),ema9:e9,ema21:e21,ema50:e50,rsi:momentum,fractalBias:fractal.bias,fractalRegime:fractal.regime,fractalConfidence:fractal.confidence,fractalConfirmed,lastCandleEpoch:candles.at(-1).epoch};
}
function analyzeMultiTimeframe(data) {
  const frames=[
    {key:'1h',role:'macro trend',candles:data[3600]},
    {key:'15m',role:'trend confirmation',candles:data[900]},
    {key:'5m',role:'setup confirmation',candles:data[300]},
    {key:'1m',role:'entry trigger',candles:data[60]}
  ];
  const reports={};
  for(const frame of frames) reports[frame.key]={role:frame.role,...analyzeTimeframe(frame.candles)};
  const dirs=frames.map(f=>reports[f.key].direction);
  const unanimous=dirs.every(d=>d===dirs[0])&&dirs[0]!=='WAIT';
  const allFractal=frames.every(f=>reports[f.key].fractalConfirmed);
  const signal=unanimous&&allFractal?dirs[0]:'WAIT';
  const aligned=dirs.filter(d=>d===dirs[0]&&d!=='WAIT').length;
  const confidence=signal==='WAIT'?0:Math.round(frames.reduce((s,f)=>s+reports[f.key].fractalConfidence,0)/frames.length);
  let reason='Timeframes do not all agree; wait for alignment.';
  if(unanimous&&!allFractal) reason='Directional trends agree, but one or more timeframes lack balanced fractal confirmation.';
  if(signal!=='WAIT') reason='All four timeframes agree and each has balanced fractal confirmation.';
  return {mode:'multi-timeframe-confirmation',signal,confidence,alignmentCount:aligned,timeframes:reports,reason,execution:false};
}
module.exports={analyzeTimeframe,analyzeMultiTimeframe};
