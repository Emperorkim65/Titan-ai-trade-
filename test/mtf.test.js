'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {analyzeMultiTimeframe}=require('../mtf');
function series(n,dir,offset=0){
 let p=100+offset;const out=[];
 for(let i=0;i<n;i++){const d=dir*(0.001+Math.sin(i*.17)*0.00008);const o=p;p*=1+d;out.push({epoch:1700000000+i*60,open:o,high:Math.max(o,p)*1.0005,low:Math.min(o,p)*0.9995,close:p});}
 return out;
}
test('multi-timeframe engine returns WAIT when directions disagree',()=>{
 const data={3600:series(150,1),900:series(150,1),300:series(150,-1),60:series(150,1)};
 const r=analyzeMultiTimeframe(data);assert.equal(r.signal,'WAIT');assert.equal(r.execution,false);assert.equal(Object.keys(r.timeframes).length,4);
});
test('multi-timeframe engine requires all four candle sets',()=>{
 assert.throws(()=>analyzeMultiTimeframe({3600:series(150,1)}),/at least 60/);
});
