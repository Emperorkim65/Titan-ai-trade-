// Weierstrass-inspired multi-scale market analysis; not a literal fit of the classical function.
const DEFAULTS = { lookback: 128, lags: [1,2,4,8,16], weights: [1,.5,.25,.125,.0625], minConfidence: 52, maxDimension: 1.85 };
const mean = a => a.length ? a.reduce((s,v)=>s+v,0)/a.length : NaN;
function slope(xs,ys){const xm=mean(xs),ym=mean(ys);let n=0,d=0;for(let i=0;i<xs.length;i++){n+=(xs[i]-xm)*(ys[i]-ym);d+=(xs[i]-xm)**2;}return d>0?n/d:NaN;}
function analyzeFractal(candles, options={}) {
  if(!Array.isArray(candles)||candles.length<40) throw new Error("Fractal analysis requires at least 40 candles");
  const lookback=Math.max(40,Math.min(512,Number(options.lookback)||DEFAULTS.lookback));
  const prices=candles.map(c=>Number(c&&c.close));
  if(prices.some(v=>!Number.isFinite(v)||v<=0)) throw new Error("Fractal analysis received invalid candle closes");
  const logs=prices.map(Math.log), returns=[];
  for(let i=1;i<logs.length;i++) returns.push(logs[i]-logs[i-1]);
  const sample=returns.slice(-lookback), sigma=Math.sqrt(mean(sample.map(v=>v*v)));
  if(!Number.isFinite(sigma)||sigma<1e-12) return {bias:"NEUTRAL",regime:"UNDEFINED",hurstExponent:null,fractalDimension:null,directionalScore:0,coherence:0,confidence:0,scales:[],explanation:"Price changes are too small to estimate market structure."};
  const xs=[],ys=[],scales=[];
  for(const lag of DEFAULTS.lags){
    const increments=[];for(let i=lag;i<logs.length;i++) increments.push(logs[i]-logs[i-lag]);
    const recent=increments.slice(-Math.max(20,Math.floor(lookback/lag))), structure=mean(recent.map(v=>v*v));
    if(Number.isFinite(structure)&&structure>0){xs.push(Math.log(lag));ys.push(Math.log(structure));scales.push({lag,rmsLogMove:Number(Math.sqrt(structure).toPrecision(8))});}
  }
  const sl=xs.length>=3?slope(xs,ys):NaN, h=Number.isFinite(sl)?Math.max(0,Math.min(1,sl/2)):null, dimension=h===null?null:2-h;
  const parts=DEFAULTS.lags.map((lag,i)=>({direction:Math.tanh(mean(sample.slice(-lag))*Math.sqrt(lag)/(sigma*1.5)),weight:DEFAULTS.weights[i]}));
  const total=parts.reduce((s,p)=>s+p.weight,0), score=parts.reduce((s,p)=>s+p.direction*p.weight,0)/total;
  const magnitude=parts.reduce((s,p)=>s+Math.abs(p.direction)*p.weight,0)/total, coherence=magnitude>1e-9?Math.min(1,Math.abs(score)/magnitude):0;
  const confidence=Math.round(Math.max(0,Math.min(100,Math.abs(score)*65+coherence*35)));
  const bias=score>.12?"BULLISH":score<-.12?"BEARISH":"NEUTRAL";
  let regime="MIXED";if(dimension!==null&&dimension>=1.85)regime="CHOPPY";else if(dimension!==null&&dimension<=1.45&&coherence>=.55)regime="TRENDING";else if(dimension!==null&&dimension>1.45&&dimension<1.85)regime="TRANSITIONAL";
  return {bias,regime,hurstExponent:h===null?null:Number(h.toFixed(4)),fractalDimension:dimension===null?null:Number(dimension.toFixed(4)),directionalScore:Number(score.toFixed(4)),coherence:Number(coherence.toFixed(4)),confidence,scales,explanation:regime.toLowerCase()+" structure; "+bias.toLowerCase()+" multi-scale bias with "+confidence+"% model confidence."};
}
function confirmsBalancedSignal(signal,fractal,options={}) {
  const min=Number(options.minConfidence)||DEFAULTS.minConfidence, max=Number(options.maxDimension)||DEFAULTS.maxDimension;
  if(!["BUY","SELL"].includes(signal)||!fractal||fractal.confidence<min||fractal.fractalDimension===null||fractal.fractalDimension>=max||fractal.regime==="CHOPPY") return false;
  return signal==="BUY"?fractal.bias==="BULLISH":fractal.bias==="BEARISH";
}
module.exports={analyzeFractal,confirmsBalancedSignal};
