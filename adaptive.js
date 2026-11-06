'use strict';
// Adaptive signal ensemble. Weights are learned only from the historical in-sample
// segment; the out-of-sample segment is never used to set live signal weights.
const { analyzeFractal, confirmsBalancedSignal } = require('./fractal');
const { runBacktest } = require('./backtest');

function mean(a){return a.reduce((s,v)=>s+v,0)/a.length;}
function ema(a,p){if(a.length<p)return null;const k=2/(p+1);let v=mean(a.slice(0,p));for(let i=p;i<a.length;i++)v=a[i]*k+v*(1-k);return v;}
function rsi(a,p=14){if(a.length<=p)return null;let g=0,l=0;for(let i=1;i<=p;i++){const d=a[i]-a[i-1];if(d>0)g+=d;else l-=d;}g/=p;l/=p;for(let i=p+1;i<a.length;i++){const d=a[i]-a[i-1];g=(g*(p-1)+Math.max(d,0))/p;l=(l*(p-1)+Math.max(-d,0))/p;}return l===0?100:100-100/(1+g/l);}
function currentSignals(candles){
 const closes=candles.map(c=>Number(c.close));
 const f=ema(closes,9),m=ema(closes,21),s=ema(closes,50),momentum=rsi(closes);
 let emaSignal='WAIT';
 if(f!==null&&m!==null&&s!==null&&momentum!==null){
  if(f>m&&m>s&&closes.at(-1)>f&&momentum>=52&&momentum<=72)emaSignal='BUY';
  else if(f<m&&m<s&&closes.at(-1)<f&&momentum>=28&&momentum<=48)emaSignal='SELL';
 }
 const fractal=analyzeFractal(candles.slice(-160));
 const fractalSignal=confirmsBalancedSignal(fractal.bias==='BULLISH'?'BUY':fractal.bias==='BEARISH'?'SELL':'WAIT',fractal)?(fractal.bias==='BULLISH'?'BUY':'SELL'):'WAIT';
 const combined=emaSignal!=='WAIT'&&confirmsBalancedSignal(emaSignal,fractal)?emaSignal:'WAIT';
 return {ema:emaSignal,fractal:fractalSignal,combined,fractal};
}
function rawScore(stats){
 if(!stats||stats.trades<8)return 0;
 const pf=stats.profitFactor===null?1.5:Math.min(3,Math.max(0,stats.profitFactor));
 const expectancy=Math.max(0,Math.min(2,stats.expectancyR+0.25));
 const drawdown=Math.max(0,stats.maxDrawdownPercent)/100;
 const reliability=Math.min(1,stats.trades/30);
 return Math.max(0,pf*expectancy*(1-drawdown)*reliability);
}
function analyzeAdaptive(candles,options={}){
 if(!Array.isArray(candles)||candles.length<400)throw new Error('Adaptive analysis requires at least 400 candles');
 // Exclude the newest candle from calibration; use only prior history.
 const history=candles.slice(0,-1);
 const calibration=runBacktest(history,{trainRatio:options.trainRatio||0.7,costBps:options.costBps??1,riskPercent:1});
 const stats=Object.fromEntries(Object.entries(calibration.results).map(([k,v])=>[k,v.inSample]));
 const scores=Object.fromEntries(Object.entries(stats).map(([k,v])=>[k,rawScore(v)]));
 const total=Object.values(scores).reduce((a,b)=>a+b,0);
 const weights=total>0?Object.fromEntries(Object.entries(scores).map(([k,v])=>[k,Number((v/total).toFixed(4))])):{ema:0.3333,fractal:0.3333,combined:0.3334};
 const signals=currentSignals(candles);
 let directional=0,active=0;
 for(const key of ['ema','fractal','combined']){
  const sig=signals[key],w=weights[key];
  if(sig==='BUY'){directional+=w;active+=w;}
  else if(sig==='SELL'){directional-=w;active+=w;}
 }
 const agreement=active?Math.abs(directional)/active:0;
 const signal=active&&Math.abs(directional)>=0.2?(directional>0?'BUY':'SELL'):'WAIT';
 const confidence=Math.round(Math.min(95,Math.abs(directional)*100*agreement));
 return {mode:'adaptive-ensemble',signal,confidence,weights,componentSignals:{ema:signals.ema,fractal:signals.fractal,combined:signals.combined},fractal:signals.fractal,calibration:{method:'prior-history in-sample only',candles:history.length,strategies:Object.fromEntries(Object.entries(stats).map(([k,v])=>[k,{trades:v.trades,expectancyR:v.expectancyR,profitFactor:v.profitFactor,maxDrawdownPercent:v.maxDrawdownPercent}]))},reason:signal==='WAIT'?'No sufficiently strong weighted directional agreement.':'Weighted strategy agreement supports '+signal+'.',execution:false};
}
module.exports={analyzeAdaptive};
