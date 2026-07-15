import type { BacktestResult, EquityPoint, FormState, Trade } from "../types";

type Bar = { date:string; open:number; close:number };
const round = (v:number, n=2) => Number(v.toFixed(n));

function generateBars(start:string, end:string): Bar[] {
  const bars:Bar[]=[]; let seed=20260715; let price=100; const cursor=new Date(start+"T00:00:00"); const finish=new Date(end+"T00:00:00");
  const random=()=>{ seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; };
  let i=0;
  while(cursor<=finish && bars.length<900){ const day=cursor.getDay(); if(day!==0&&day!==6){ const cycle=Math.sin(i/11)*.008; const ret=.00032+cycle+(random()-.5)*.018; const open=price*(1+(random()-.5)*.006); price=Math.max(20,price*(1+ret)); bars.push({date:cursor.toISOString().slice(0,10),open,close:price}); i++; } cursor.setDate(cursor.getDate()+1); }
  return bars;
}

const sma=(values:number[], period:number, index:number)=> index+1<period ? null : values.slice(index-period+1,index+1).reduce((a,b)=>a+b,0)/period;

export function runDemoBacktest(form:FormState):BacktestResult{
  const bars=generateBars(form.startDate,form.endDate); if(bars.length<Math.max(form.slow+3,20)) throw new Error("有效回测期过短，无法完成指标预热");
  const closes=bars.map(b=>b.close); let cash=form.initialCash,qty=0,entry=0,entryIndex=0,pending:"buy"|"sell"|null=null,signalDate="",peak=form.initialCash,prev=form.initialCash; const equity:EquityPoint[]=[]; const trades:Trade[]=[]; const benchmarkQty=form.initialCash/bars[0].close;
  for(let i=0;i<bars.length;i++){ const bar=bars[i];
    if(pending==="buy"&&qty===0){ const price=bar.open*(1+form.slippage); const amount=cash*form.position; let n=Math.floor(amount/(price*(1+form.commission))/100)*100; let fee=n*price*form.commission; while(n>0&&n*price+fee>cash){n-=100;fee=n*price*form.commission;} if(n>0){cash-=n*price+fee;qty=n;entry=price;entryIndex=i;trades.push({signal_date:signalDate,trade_date:bar.date,side:"buy",price:round(price,4),quantity:n,commission:round(fee),stamp_duty:0,realized_profit:null,holding_days:null,reason:"SMA快线上穿慢线"});} pending=null; }
    if(pending==="sell"&&qty>0){const price=bar.open*(1-form.slippage),gross=price*qty,fee=gross*form.commission,tax=gross*form.stampDuty,profit=gross-fee-tax-entry*qty;cash+=gross-fee-tax;trades.push({signal_date:signalDate,trade_date:bar.date,side:"sell",price:round(price,4),quantity:qty,commission:round(fee),stamp_duty:round(tax),realized_profit:round(profit),holding_days:i-entryIndex,reason:"退出规则或风控触发"});qty=0;pending=null;}
    const fast=sma(closes,form.fast,i),slow=sma(closes,form.slow,i),pf=sma(closes,form.fast,i-1),ps=sma(closes,form.slow,i-1);
    if(i<bars.length-1&&fast!==null&&slow!==null&&pf!==null&&ps!==null){ if(qty===0&&pf<=ps&&fast>slow){pending="buy";signalDate=bar.date;} else if(qty>0){const pnl=bar.close/entry-1,held=i-entryIndex;if((pf>=ps&&fast<slow)||pnl<=-form.stopLoss||pnl>=form.takeProfit||(form.maxHoldingDays!==null&&held>=form.maxHoldingDays)){pending="sell";signalDate=bar.date;}} }
    const total=cash+qty*bar.close;peak=Math.max(peak,total);equity.push({trade_date:bar.date,total_equity:round(total),benchmark_equity:round(benchmarkQty*bar.close),cash:round(cash),drawdown:total/peak-1,position_quantity:qty});prev=total;
  }
  if(qty>0){const bar=bars.at(-1)!;const price=bar.close*(1-form.slippage),gross=price*qty,fee=gross*form.commission,tax=gross*form.stampDuty,profit=gross-fee-tax-entry*qty;cash+=gross-fee-tax;trades.push({signal_date:bar.date,trade_date:bar.date,side:"sell",price:round(price,4),quantity:qty,commission:round(fee),stamp_duty:round(tax),realized_profit:round(profit),holding_days:bars.length-1-entryIndex,reason:"回测结束按最后收盘价强制平仓"});const p=equity.at(-1)!;p.cash=round(cash);p.total_equity=round(cash);p.position_quantity=0;}
  let runningPeak=0;equity.forEach(p=>{runningPeak=Math.max(runningPeak,p.total_equity);p.drawdown=p.total_equity/runningPeak-1;});
  const returns=equity.slice(1).map((p,i)=>p.total_equity/equity[i].total_equity-1);const mean=returns.reduce((a,b)=>a+b,0)/Math.max(1,returns.length);const variance=returns.length>1?returns.reduce((a,b)=>a+(b-mean)**2,0)/(returns.length-1):0;const stdev=Math.sqrt(variance);const total=equity.at(-1)!.total_equity/form.initialCash-1;const benchmark=equity.at(-1)!.benchmark_equity/form.initialCash-1;const sells=trades.filter(t=>t.side==="sell"),wins=sells.filter(t=>(t.realized_profit||0)>0),losses=sells.filter(t=>(t.realized_profit||0)<0);const avg=(xs:number[])=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;const winAvg=avg(wins.map(t=>t.realized_profit!)),lossAvg=avg(losses.map(t=>Math.abs(t.realized_profit!)));
  return {status:"success",symbol:form.symbol,instrument_name:form.instrumentName,equity,trades,warnings:[...(bars.length<60?["有效回测期过短，需进一步核验"]:[]),...(sells.length<5?["交易次数过少，结果可能受单次交易显著影响，需进一步核验"]:[])],data_snapshot_time:new Date().toISOString(),data_source:"固定种子模拟行情（仅演示）",strategy_version:1,metrics:{total_return:total,annualized_return:(1+total)**(252/equity.length)-1,benchmark_return:benchmark,excess_return:total-benchmark,annualized_volatility:stdev*Math.sqrt(252),sharpe_ratio:stdev?mean/stdev*Math.sqrt(252):null,max_drawdown:Math.min(...equity.map(p=>p.drawdown)),win_rate:sells.length?wins.length/sells.length:null,profit_loss_ratio:winAvg!==null&&lossAvg!==null?winAvg/lossAvg:null,trade_count:sells.length,average_holding_days:avg(sells.map(t=>t.holding_days||0))}};
}
