'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {analyzeAdaptive}=require('../adaptive');
function candles(n=650){let p=100;const out=[];for(let i=0;i<n;i++){const d=(i%160<80?.001:-.001)+Math.sin(i*.61)*.0007;const o=p;p*=Math.exp(d);out.push({epoch:1700000000+i*60,open:o,high:Math.max(o,p)*1.001,low:Math.min(o,p)*.999,close:p});}return out;}
test('adaptive engine returns normalized weights and no execution action',()=>{const r=analyzeAdaptive(candles());const sum=Object.values(r.weights).reduce((a,b)=>a+b,0);assert.ok(Math.abs(sum-1)<0.002);assert.ok(['BUY','SELL','WAIT'].includes(r.signal));assert.equal(r.execution,false);assert.ok(r.calibration.candles===649);});
test('adaptive engine rejects insufficient history',()=>assert.throws(()=>analyzeAdaptive(candles(200)),/at least 400/));
