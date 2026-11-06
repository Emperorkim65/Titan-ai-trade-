'use strict';
// Historical, candle-close signal backtest with next-candle-open entries.
// All strategies share identical candles, risk, exits, costs and chronological split.
const { analyzeFractal, confirmsBalancedSignal } = require('./fractal');
const DEFAULTS = { trainRatio: 0.7, riskPercent: 1, costBps: 1, stopAtr: 1.5, targetR: 2, maxHoldBars: 50, warmup: 100, fractalWindow: 160 };
function avg(a){ return a.length ? a.reduce((s,v)=>s+v,0)/a.length : null; }
function ema(a,p){ if(a.length<p)return null;const k=2/(p+1);let v=avg(a.slice(0,p));for(let i=p;i<a.length;i++)v=a[i]*k+v*(1-k);return v; }
function rsi(a,p=14){if(a.length<=p)return null;let g=0,l=0;for(let i=1;i<=p;i++){const d=a[i]-a[i-1];if(d>0)g+=d;else l-=d;}g/=p;l/=p;for(let i=p+1;i<a.length;i++){const d=a[i]-a[i-1];g=(g*(p-1)+Math.max(d,0))/p;l=(l*(p-1)+Math.max(-d,0))/p;}return l===0?100:100-100/(1+g/l);}
function atr(c,p=14){if(c.length<=p)return null;let sum=0;for(let i=c.length-p;i<c.length;i++){const x=c[i],prev=c[i-1];sum+=Math.max(x.high-x.low,Math.abs(x.high-prev.close),Math.abs(x.low-prev.close));}return sum/p;}
function emaSignal(closes, fast, mid, slow, momentum){
 if(fast>mid&&mid>slow&&closes[closes.length-1]>fast&&momentum>=52&&momentum<=72)return 'BUY';
 if(fast<mid&&mid<slow&&closes[closes.length-1]<fast&&momentum>=28&&momentum<=48)return 'SELL';
 return 'WAIT';
}
function signalSet(candles,options){
 const out=new Array(candles.length).fill(null);
 for(let i=options.warmup;i<candles.length-1;i++){
  const window=candles.slice(0,i+1), closes=window.map(x=>x.close);
  const f=ema(closes,9),m=ema(closes,21),s=ema(closes,50),mom=rsi(closes),vol=atr(window);
  if([f,m,s,mom,vol].some(x=>x===null||!Number.isFinite(x))||vol<=0)continue;
  const e=emaSignal(closes,f,m,s,mom);
  const fractal=analyzeFractal(window.slice(-options.fractalWindow));
  const fractalSignal=confirmsBalancedSignal(fractal.bias==='BULLISH'?'BUY':fractal.bias==='BEARISH'?'SELL':'WAIT',fractal,{minConfidence:options.minFractalConfidence,maxDimension:options.maxFractalDimension})?'DIRECTIONAL':'WAIT';
  const fSignal=fractalSignal==='DIRECTIONAL'?(fractal.bias==='BULLISH'?'BUY':'SELL'):'WAIT';
  out[i]={ema:e,fractal:fSignal,combined:e!=='WAIT'&&confirmsBalancedSignal(e,fractal,{minConfidence:options.minFractalConfidence,maxDimension:options.maxFractalDimension})?e:'WAIT',atr:vol};
 }
 return out;
}
function simulate(candles,signals,method,start,end,options){
 let equity=1,peak=1,maxDrawdown=0, wins=0,losses=0,flats=0,grossProfit=0,grossLoss=0,totalR=0;
 const trades=[];let i=Math.max(start-1,options.warmup);
 while(i<end-1){
  const sig=signals[i]&&signals[i][method];
  if(sig!=='BUY'&&sig!=='SELL'){i++;continue;}
  const entryBar=i+1,entry=Number(candles[entryBar].open),risk=signals[i].atr*options.stopAtr;
  if(!Number.isFinite(entry)||entry<=0||!Number.isFinite(risk)||risk<=0){i++;continue;}
  const dir=sig==='BUY'?1:-1,stop=entry-dir*risk,target=entry+dir*risk*options.targetR;
  let exit=Number(candles[Math.min(end-1,entryBar+options.maxHoldBars-1)].close),exitIndex=Math.min(end-1,entryBar+options.maxHoldBars-1),exitReason='TIME';
  for(let j=entryBar;j<=Math.min(end-1,entryBar+options.maxHoldBars-1);j++){
   const c=candles[j],o=Number(c.open),h=Number(c.high),l=Number(c.low);
   if(![o,h,l,c.close].every(Number.isFinite)){continue;}
   // Conservative gap handling; if stop and target both hit intrabar, assume stop first.
   if(dir===1){
    if(o<=stop){exit=o;exitIndex=j;exitReason='STOP_GAP';break;}
    if(o>=target){exit=target;exitIndex=j;exitReason='TARGET_GAP';break;}
    if(l<=stop){exit=stop;exitIndex=j;exitReason='STOP';break;}
    if(h>=target){exit=target;exitIndex=j;exitReason='TARGET';break;}
   }else{
    if(o>=stop){exit=o;exitIndex=j;exitReason='STOP_GAP';break;}
    if(o<=target){exit=target;exitIndex=j;exitReason='TARGET_GAP';break;}
    if(h>=stop){exit=stop;exitIndex=j;exitReason='STOP';break;}
    if(l<=target){exit=target;exitIndex=j;exitReason='TARGET';break;}
   }
  }
  const grossR=dir*(exit-entry)/risk;
  const feeR=((entry+exit)*options.costBps/10000)/risk;
  const netR=grossR-feeR, riskCash=equity*options.riskPercent/100, pnlPct=(netR*options.riskPercent)/100;
  equity*=Math.max(0,1+pnlPct);
  peak=Math.max(peak,equity);maxDrawdown=Math.max(maxDrawdown,peak>0?(peak-equity)/peak:0);
  if(netR>0){wins++;grossProfit+=netR;}else if(netR<0){losses++;grossLoss+=Math.abs(netR);}else flats++;
  totalR+=netR;
  trades.push({side:sig,signalTime:candles[i].epoch,entryTime:candles[entryBar].epoch,exitTime:candles[exitIndex].epoch,entry:Number(entry.toPrecision(9)),exit:Number(exit.toPrecision(9)),stop:Number(stop.toPrecision(9)),target:Number(target.toPrecision(9)),exitReason,grossR:Number(grossR.toFixed(4)),netR:Number(netR.toFixed(4)),pnlPercent:Number((pnlPct*100).toFixed(4))});
  i=exitIndex+1;
 }
 const count=trades.length;
 return {trades:count,wins,losses,breakeven:flats,winRate:count?Number((wins/count*100).toFixed(2)):0,profitFactor:grossLoss?Number((grossProfit/grossLoss).toFixed(3)):grossProfit>0?null:0,netReturnPercent:Number(((equity-1)*100).toFixed(2)),maxDrawdownPercent:Number((maxDrawdown*100).toFixed(2)),expectancyR:count?Number((totalR/count).toFixed(4)):0,averageR:count?Number((totalR/count).toFixed(4)):0,finalEquity:Number(equity.toFixed(5)),tradesSample:trades.slice(-100)};
}
function runBacktest(candles,input={}){
 if(!Array.isArray(candles)||candles.length<300)throw new Error('Backtest requires at least 300 historical candles');
 const options={...DEFAULTS,...input};
 options.trainRatio=Math.max(.6,Math.min(.85,Number(options.trainRatio)||DEFAULTS.trainRatio));
 options.riskPercent=Math.max(.1,Math.min(5,Number(options.riskPercent)||DEFAULTS.riskPercent));
 options.costBps=Math.max(0,Math.min(100,Number(options.costBps)||0));
 options.stopAtr=Math.max(.5,Math.min(5,Number(options.stopAtr)||DEFAULTS.stopAtr));
 options.targetR=Math.max(.5,Math.min(10,Number(options.targetR)||DEFAULTS.targetR));
 options.maxHoldBars=Math.max(2,Math.min(500,Math.floor(Number(options.maxHoldBars)||DEFAULTS.maxHoldBars)));
 options.warmup=DEFAULTS.warmup;options.fractalWindow=DEFAULTS.fractalWindow;
 options.minFractalConfidence=52;options.maxFractalDimension=1.85;
 const clean=candles.map(c=>({epoch:Number(c.epoch),open:Number(c.open),high:Number(c.high),low:Number(c.low),close:Number(c.close)}));
 if(clean.some(c=>![c.open,c.high,c.low,c.close].every(Number.isFinite)||c.open<=0||c.high<c.low||c.close<=0))throw new Error('Historical candles contain invalid OHLC values');
 for(let i=1;i<clean.length;i++)if(clean[i].epoch<=clean[i-1].epoch)throw new Error('Historical candles must be in ascending time order');
 const split=Math.floor(clean.length*options.trainRatio);
 if(split<options.warmup+20||clean.length-split<30)throw new Error('Not enough candles on both sides of the chronological train/test split');
 const signals=signalSet(clean,options),methods=['ema','fractal','combined'],results={};
 for(const method of methods){
  results[method]={inSample:simulate(clean,signals,method,options.warmup,split,options),outOfSample:simulate(clean,signals,method,split,clean.length,options)};
 }
 return {mode:'historical-backtest',methodology:'Chronological split; signal at candle close; entry at next candle open; ATR stop; fixed-R target; conservative stop-first intrabar handling; no parameter fitting on out-of-sample data.',assumptions:{trainRatio:options.trainRatio,riskPercent:options.riskPercent,costBpsPerSide:options.costBps,stopAtr:options.stopAtr,targetR:options.targetR,maxHoldBars:options.maxHoldBars,warmupCandles:options.warmup},data:{candles:clean.length,firstEpoch:clean[0].epoch,lastEpoch:clean[clean.length-1].epoch,splitIndex:split,trainCandles:split,testCandles:clean.length-split},results};
}
module.exports={runBacktest};
