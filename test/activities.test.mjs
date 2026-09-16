import test from 'node:test';
import assert from 'node:assert/strict';
import { createActivityInbox, createActivityDirector, choreography, AMBIENT_ACTIVITIES } from '../src/client/activities.js';
import { createActivityFeed } from '../src/host/activity-feed.js';
import { homePoint, officePath, sitePoint, isOfficeWalkable } from '../src/client/team-office/navigation.js';

function fixture(options) {
  const callbacks=new Map(),root={id:'lead',session:{id:'lead'}}, ctx={on:(key,fn)=>{callbacks.set(key,fn);return()=>callbacks.delete(key);},sessionProjections:{stateOf:()=>({messages:[],delivered:[]})},sessions:{flush:async()=>true}};
  const feed=createActivityFeed(ctx,options);let source=0;
  const event=(type,data)=>callbacks.get('session/event')(root.session,{seq:++source,type,data:{teamId:'lead',...data}});
  return{ctx,feed,root,event,callbacks};
}
test('first read is a baseline; delivered messages publish once after a successful checkpoint',async()=>{
  const f=fixture(),first=await f.feed.read(f.root,null);
  f.event('team/message/queued',{message:{id:'m',senderId:'lead',targetId:'worker',content:[{type:'text',text:'private body'}]}});
  let read=await f.feed.read(f.root,first.cursor);assert.deepEqual(read.activities,[]);
  f.event('team/message/delivered',{messageId:'m',targetId:'worker'});
  f.ctx.sessions.flush=async()=>{throw Error('disk');};await assert.rejects(f.feed.read(f.root,read.cursor),/disk/);
  f.ctx.sessions.flush=async()=>true;
  const [a,b]=await Promise.all([f.feed.read(f.root,read.cursor),f.feed.read(f.root,read.cursor)]);
  assert.equal(a.activities.length,1);assert.equal(b.activities.length,1);assert.equal(a.cursor.seq,1);
  assert.equal(a.activities[0].actor,'lead');assert.ok(!JSON.stringify(a).includes('private body'));
  assert.deepEqual((await f.feed.read(f.root,a.cursor)).activities,[]);
  f.feed.dispose();assert.equal(f.callbacks.size,0);
});
test('overflow, stale cursors and replacement sessions establish new baselines',async()=>{
  const f=fixture({capacity:2});const first=await f.feed.read(f.root,null);
  for(let revision=1;revision<=4;revision++)f.event('team/task',{task:{id:'t',revision,status:'pending'}});
  const reset=await f.feed.read(f.root,first.cursor);assert.equal(reset.reset,true);assert.equal(reset.activities.length,0);
  const restored=await f.feed.read({...f.root,session:{id:'lead'}},reset.cursor);assert.equal(restored.reset,true);
  f.feed.dispose();
});
test('inbox maps ownership, message delivery and completion without replay on view changes',()=>{
  const box=createActivityInbox();const base={state:'live',leadId:'lead',tasks:[],cursor:{epoch:'e',seq:0},reset:true};
  assert.deepEqual(box.accept(base),[]);
  const activities=[{kind:'task',taskId:'t',revision:1,status:'pending',seq:1}, {kind:'task',taskId:'t',revision:2,status:'in_progress',owner:'w',seq:2}, {kind:'task',taskId:'t',revision:3,status:'completed',owner:'w',seq:3},{kind:'message',actor:'w',target:'lead',seq:4}];
  const next={...base,reset:false,cursor:{epoch:'e',seq:4},activities,tasks:[{id:'t',status:'completed',ownerId:'w'}]};
  const events=box.accept(next);assert.deepEqual(events.map(e=>e.kind),['pin','handoff','archive','message']);assert.equal(events[2].celebrate,true);
  assert.deepEqual(box.accept(next),[]);assert.deepEqual(box.accept({...next,reset:true,cursor:{epoch:'new',seq:4}}),[]);
});
test('all 17 desks can reach all amenities and the Lead visitor point without crossing furniture',()=>{
  for(let index=0;index<17;index++)for(const kind of [...AMBIENT_ACTIVITIES,'sink','pin','archive','visitor']){
    const target=sitePoint(kind,index);const path=officePath(homePoint(index),target);assert.ok(path,`${index}/${kind}`);
    for(let i=0;i<path.length;i++){
      const a=path[i-1]??path[i],b=path[i],n=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.05);
      for(let j=0;j<=n;j++){const t=n?j/n:0;assert.ok(isOfficeWalkable(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t),`${index}/${kind}: crosses obstruction`);}
    }
    if(index===0)assert.ok(path.every(p=>p.x < -5.5 && p.z < -1.15),'Lead stays in its private room');
  }
});
const roster=[{id:'lead',role:'lead',status:'idle'},{id:'a',role:'teammate',status:'idle'},{id:'b',role:'teammate',status:'idle'}];
function renderer(){const calls=[];return{calls,plan:e=>choreography(e,{leadId:'lead',home:id=>({id,site:id}),site:(kind,id)=>({kind,id,site:kind}),meet:()=>({site:'lead-door'})}),hold:id=>calls.push(['hold',id]),walk:(id,to)=>{calls.push(['walk',id,to]);return true;},arrived:()=>true,action:(id,k)=>calls.push(['action',id,k]),release:id=>calls.push(['release',id]),envelope:(a,b)=>calls.push(['envelope',a,b])};}
test('visitors serialize, reciprocal messages alternate, and removed members release every actor',()=>{
  const r=renderer(),d=createActivityDirector(r,{ambientDelay:1000});d.update(roster);
  const event=(id,actor,target)=>({id,kind:'message',actor,target,at:Date.now()});
  d.enqueue([event('1','a','lead'),event('2','lead','a'),event('3','b','lead')]);d.tick(.05);
  assert.equal(d.inspect().active.length,1);assert.equal(d.inspect().queued,1);
  for(let i=0;i<130;i++)d.tick(.05);
  assert.ok(r.calls.some(c=>c[0]==='action'&&c[1]==='lead'&&c[2]==='talk'));
  d.update(roster.slice(0,1));assert.equal(d.inspect().active.length,0);d.dispose();
});
test('every ambient action runs its choreography and new work cancels it',()=>{
  for(const kind of AMBIENT_ACTIVITIES){const plan=choreography({kind,actor:'a'},{home:()=>({}),site:()=>({site:kind})});assert.ok(plan.phases.some(p=>p.actions?.length));assert.ok(plan.phases.some(p=>p.walk?.length));}
  const r=renderer(),d=createActivityDirector(r,{ambientDelay:0});d.update(roster);d.tick(.05);assert.equal(d.inspect().active.length,1);
  d.update(roster.map(m=>({...m,status:'running'})));assert.equal(d.inspect().active.length,0);assert.ok(r.calls.some(c=>c[0]==='release'));d.dispose();
});

import { createOfficeAvailability } from '../src/client/availability.js';
test('office entry only exists after Teams is enabled and unregisters when disabled',()=>{
  let entries=0,cleared=0;const gate=createOfficeAvailability(()=>{entries++;return()=>entries--;},()=>cleared++);
  assert.equal(entries,0);gate.update({state:'disabled'});assert.equal(entries,0);
  gate.update({state:'unselected'});gate.update({state:'live'});assert.equal(entries,1);
  gate.update({state:'disabled'});assert.equal(entries,0);assert.equal(cleared,1);
  gate.update({state:'inactive'});assert.equal(entries,1);gate.dispose();assert.equal(entries,0);
});

test('a reply during an ongoing visit adds the actual speaker without scheduling a second visit',()=>{
  const r=renderer(),d=createActivityDirector(r,{ambientDelay:1000});d.update(roster);
  d.enqueue([{id:'send',kind:'message',actor:'lead',target:'a',at:Date.now()}]);d.tick(.05);
  d.enqueue([{id:'reply',kind:'message',actor:'a',target:'lead',at:Date.now()}]);
  assert.equal(d.inspect().queued,0);
  for(let i=0;i<180;i++)d.tick(.05);
  assert.deepEqual(r.calls.filter(c=>c[0]==='action'&&c[2]==='talk').map(c=>c[1]),['lead','a']);
  d.dispose();
});
test('unreachable routes release actors without performing a fake interaction',()=>{
  const r=renderer();r.walk=()=>false;const d=createActivityDirector(r,{ambientDelay:1000});d.update(roster);
  d.enqueue([{id:'blocked',kind:'message',actor:'a',target:'lead',at:Date.now()}]);d.tick(.05);d.tick(.05);
  assert.equal(d.inspect().active.length,0);assert.ok(!r.calls.some(c=>c[0]==='action'));d.dispose();
});
test('parallel tool results clear only their own call, without exporting arguments',async()=>{
  const f=fixture();f.ctx.agents={get:()=>f.root};f.ctx.get=()=>({tryMembership:()=>({root:f.root})});
  const initial=await f.feed.read(f.root,null);
  f.event('tool/call',{callId:'a',name:'read_file',arguments:'secret'});
  f.event('tool/call',{callId:'b',name:'search',arguments:'secret'});
  f.event('tool/result',{message:{content:[{toolCallId:'a'}]}});
  let next=await f.feed.read(f.root,initial.cursor);assert.equal(next.tools.lead.name,'search');assert.ok(!JSON.stringify(next).includes('secret'));
  f.event('tool/result',{message:{content:[{toolCallId:'b'}]}});
  next=await f.feed.read(f.root,next.cursor);assert.deepEqual(next.tools,{});f.feed.dispose();
});
