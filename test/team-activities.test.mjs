import test from 'node:test';
import assert from 'node:assert/strict';
import { createTeamActivities } from '../src/client/team-office/activities.js';
import { createTeamMotion, updateTeamMotion } from '../src/client/team-office/motion.js';
import { AMBIENT_ACTIVITIES } from '../src/client/activities.js';
import { isOfficeWalkable } from '../src/client/team-office/navigation.js';
import { STATIONS } from '../src/client/team-office/layout.js';

test('real 3D paths finish every activity, return the actor and release both discussion partners',()=>{
  const roster=STATIONS.map((_,i)=>({id:`p${i}`,role:i?'teammate':'lead',status:'running'})),seats=new Map(roster.map((m,i)=>[m.id,i]));
  for(const kind of [...AMBIENT_ACTIVITIES,'pin','archive','handoff','message']){
    const motions=STATIONS.map((_,i)=>createTeamMotion(i)),actions=[];
    const effects={clear(){},reset(){},action(){},envelope(){}};
    const adapter=createTeamActivities({motions,rigs:[],seats:()=>seats,members:()=>roster,effects,props:{clear(){},tick(){},action:(id,action)=>actions.push([id,action])}});
    adapter.update();adapter.enqueue([{id:kind,kind,actor:'p16',target:['handoff','message'].includes(kind)?'p0':undefined,at:Date.now(),celebrate:kind==='archive'}]);
    for(let frame=0;frame<110*30;frame++){
      adapter.tick(1/30);
      for(let i=0;i<motions.length;i++) {
        updateTeamMotion(motions[i],adapter.owns(`p${i}`)?'activity':'work',1/30);
        const m=motions[i],s=STATIONS[i];
        if(adapter.owns(`p${i}`)&&!(m.z>=.4&&m.z<1.2&&Math.abs(m.x)<.66))assert.ok(isOfficeWalkable(s.x+m.x,s.z+m.z),`${kind}: live actor crosses furniture at ${s.x+m.x},${s.z+m.z}`);
      }
    }
    assert.ok(actions.length,`${kind}: executes a real action after arrival`);
    assert.equal(adapter.owns('p16'),false,`${kind}: releases the actor`);
    assert.equal(adapter.owns('p0'),false,`${kind}: releases the host`);
    assert.ok(motions[16].seated>.99,`${kind}: returns to work`);
    if(kind==='archive')assert.ok(actions.some(([,a])=>a==='cheer'));
    if(kind==='coffee')assert.deepEqual(actions.map(([,a])=>a),['cup','brew','drink','wash','put-cup']);
    adapter.dispose();
  }
});
