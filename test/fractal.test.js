'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {analyzeFractal,confirmsBalancedSignal}=require('../fractal');
function candles(returns){let p=100;return [{close:p}].concat(returns.map((r,i)=>({close:p*=Math.exp(r),epoch:i+1})));}
test('rejects insufficient candles and invalid prices',()=>{assert.throws(()=>analyzeFractal([{close:1}]),/at least 40/);assert.throws(()=>analyzeFractal(Array.from({length:50},()=>({close:0}))),/invalid candle/);});
test('rising market yields bounded bullish metrics',()=>{const r=analyzeFractal(candles(Array.from({length:180},(_,i)=>.001+Math.sin(i*.7)*.00015)));assert.equal(r.bias,'BULLISH');assert.ok(r.confidence>=0&&r.confidence<=100);assert.ok(r.hurstExponent>=0&&r.hurstExponent<=1);assert.ok(r.fractalDimension>=1&&r.fractalDimension<=2);});
test('falling market yields bearish bias',()=>{assert.equal(analyzeFractal(candles(Array.from({length:180},(_,i)=>-.001+Math.cos(i*.5)*.00012))).bias,'BEARISH');});
test('flat market does not create NaN or a signal',()=>{const r=analyzeFractal(Array.from({length:100},()=>({close:100})));assert.equal(r.bias,'NEUTRAL');assert.equal(r.confidence,0);assert.equal(confirmsBalancedSignal('BUY',r),false);});
test('balanced confirmation requires direction, confidence and non-choppy structure',()=>{const b={bias:'BULLISH',regime:'TRENDING',confidence:80,fractalDimension:1.4};assert.equal(confirmsBalancedSignal('BUY',b),true);assert.equal(confirmsBalancedSignal('SELL',b),false);assert.equal(confirmsBalancedSignal('BUY',{...b,confidence:20}),false);assert.equal(confirmsBalancedSignal('BUY',{...b,fractalDimension:1.9,regime:'CHOPPY'}),false);});
