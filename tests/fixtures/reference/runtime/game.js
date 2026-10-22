
(() => {
const ASSETS=window.ROOK_ASSETS;
const SCENERY=window.ROOK_SCENERY;
const root=document.getElementById('rook-wasteland-stance'),canvas=root.querySelector('canvas'),ctx=canvas.getContext('2d');
const VIEW_WIDTH=720,VIEW_HEIGHT=440,WORLD_WIDTH=2400,MIN_X=90,MAX_X=WORLD_WIDTH-90;
canvas.width=VIEW_WIDTH;canvas.height=VIEW_HEIGHT;
const camera={x:0,target:0};let stageCache=[],sceneEpoch=0;
const imgs={},keys=new Set(),touches=new Map(),joints=[];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),lerp=(a,b,t)=>a+(b-a)*t,smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
const p=(x,y)=>({x,y}),shift=(a,x,y)=>p(a.x+x,a.y+y),extend=(a,len,a0)=>p(a.x+Math.sin(a0)*len,a.y+Math.cos(a0)*len);
const scaleOf=a=>a.hp<=0&&a.deathScale!=null?a.deathScale:.84+.14*clamp((a.y-342)/64,0,1);
function makeActor(enemy){return {isEnemy:enemy,x:enemy?345:160,y:382,vx:0,vy:0,kb:0,facing:enemy?-1:1,hp:100,wounds:0,idleTime:0,idleBlend:1,gait:0,phase:0,time:0,speed:1,wind:.35,strideX:1,strideY:0,attack:null,queue:[],combo:0,chain:0,stun:0,flash:0,deadTime:0,deathScale:null,deathFrames:null,cooldown:enemy?1.1:0,explodeT:0,playing:false,bones:false,spring:{a:-.18,v:0,b:5,w:0}};}
const player=makeActor(false),enemy=makeActor(true);
let state=player,spring=player.spring,ready=false,last=null,accumulator=0,raf,healthCache='',lastStatus='',visible=true;
const spriteCache={},STEP=1/120,PLAYBACK_RATE=1.3;
function spriteKey(enemy,dark,flash){return (enemy?'enemy':'normal')+(dark?'Far':'')+(flash?'Flash':'');}
async function prepareSprites(){
 const jobs=[];
 const farParts=new Set(['farUpperArm','farForearm','farThigh','farShin']);
 for(const enemy of[false,true])for(const dark of[false,true])for(const flash of[false,true]){
  const pack=spriteCache[spriteKey(enemy,dark,flash)]={};
  for(const[name,im]of Object.entries(imgs)){
   if(dark&&!farParts.has(name))continue;
   if(!enemy&&!dark&&!flash){pack[name]=im;continue;}
   const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const g=c.getContext('2d');
   const filters=[];if(enemy)filters.push('hue-rotate(170deg) saturate(.72) brightness(.92)');if(dark)filters.push('brightness(.72) saturate(.82)');if(flash)filters.push('brightness(1.7)');
   g.filter=filters.join(' ');g.drawImage(im,0,0);
   if(typeof createImageBitmap==='function')jobs.push(createImageBitmap(c).then(bitmap=>{pack[name]=bitmap;}));
   else jobs.push(new Promise((resolve,reject)=>{const cached=new Image();cached.onload=()=>{pack[name]=cached;resolve();};cached.onerror=reject;cached.src=c.toDataURL('image/png');}));
  }
 }
 await Promise.all(jobs);
}
function partImage(name,dark=false){return spriteCache[spriteKey(state.isEnemy,dark,state.flash>0)]?.[name]||imgs[name];}
const sim={time:0,hitstop:0,shake:0,particles:[],blood:[],stains:[],hits:[],ai:true,started:false};
function bloodBurst(from,to,spec,point){
 const count=spec.damage>=16?16:10,force=spec.damage>=16?1.18:1,scale=scaleOf(to);
 for(let i=0;i<count;i++){
  const spread=(i/(count-1)-.5)*1.5,speed=(90+Math.random()*100)*force*scale;
  sim.blood.push({x:point.x,y:point.y,vx:from.facing*Math.cos(spread)*speed,vy:Math.sin(spread)*speed-80,ground:to.y+2+(Math.random()-.5)*9,life:1.5,r:(1.15+Math.random()*1.35)*scale});
 }
 if(sim.blood.length>96)sim.blood.splice(0,sim.blood.length-96);
}
function updateBlood(dt){
 for(const q of sim.blood){
  q.vx*=Math.exp(-dt*1.2);q.vy+=650*dt;q.x+=q.vx*dt;q.y+=q.vy*dt;q.life-=dt;
  if(q.y>=q.ground&&q.vy>0){
   q.life=0;sim.stains.push({x:q.x,y:q.ground,rx:q.r*2.1,ry:q.r*.65,angle:(Math.random()-.5)*.7,life:5});
  }
 }
 sim.blood=sim.blood.filter(q=>q.life>0);
 for(const q of sim.stains)q.life-=dt;
 sim.stains=sim.stains.filter(q=>q.life>0).slice(-96);
}
function drawBlood(ground){
 ctx.save();ctx.fillStyle=ctx.strokeStyle=theme.red;ctx.lineCap='round';
 for(const q of ground?sim.stains:sim.blood){
  ctx.globalAlpha=ground?.62*clamp(q.life/1.2,0,1):.92*clamp(q.life/.18,0,1);
  if(!ground){ctx.lineWidth=q.r*1.25;ctx.beginPath();ctx.moveTo(q.x,q.y);ctx.lineTo(q.x-q.vx*.018,q.y-q.vy*.018);ctx.stroke();}
  ctx.beginPath();ctx.ellipse(q.x,q.y,ground?q.rx:q.r,ground?q.ry:q.r,ground?q.angle:0,0,Math.PI*2);ctx.fill();
 }
 ctx.restore();
}
const woundSites={
 head:[[.42,.49,.032],[.55,.55,.025],[.34,.54,.027],[.46,.40,.023]],
 torso:[[.67,.29,.043],[.61,.43,.049],[.51,.55,.038],[.72,.38,.034]]
};
function drawWounds(a,region,width,height){
 if(!a.wounds)return;
 ctx.save();ctx.fillStyle=ctx.strokeStyle=theme.red;ctx.lineCap='round';
 const sites=woundSites[region];
 for(let i=0;i<Math.min(a.wounds,sites.length);i++){
  const [u,v,size]=sites[i],x=u*width,y=v*height,r=size*width;
  ctx.globalAlpha=.8;ctx.beginPath();
  for(let n=0;n<12;n++){
   const angle=n*Math.PI/6,rad=r*(n%2?.62:1)*(1+.12*Math.sin(i*7+n*3));
   const px=x+Math.cos(angle)*rad,py=y+Math.sin(angle)*rad*.72;
   if(n)ctx.lineTo(px,py);else ctx.moveTo(px,py);
  }
  ctx.closePath();ctx.fill();
  ctx.globalAlpha=.65;ctx.lineWidth=r*.32;ctx.beginPath();ctx.moveTo(x+r*.18,y);ctx.quadraticCurveTo(x+r*.4,y+r*.8,x+r*.3,y+r*1.65);ctx.stroke();
  ctx.globalAlpha=.72;
  for(let n=0;n<3;n++){const angle=i*1.3+n*2.1;ctx.beginPath();ctx.ellipse(x+Math.cos(angle)*r*1.5,y+Math.sin(angle)*r*1.1,r*.16,r*.12,angle,0,Math.PI*2);ctx.fill();}
 }
 ctx.restore();
}
let theme={};
function updateTheme(){const c=n=>getComputedStyle(root).getPropertyValue(n).trim();theme={fg:c('--foreground'),bg:c('--background')||c('--muted-foreground'),surface:c('--muted')||c('--border'),muted:c('--muted-foreground'),border:c('--border'),bone:c('--blue'),impact:c('--orange'),red:c('--red')};if(ready)prepareStage().then(render);}
updateTheme();new MutationObserver(updateTheme).observe(document.documentElement,{attributes:true,attributeFilter:['class','style','data-theme']});
function status(text){if(text!==lastStatus){lastStatus=text;root.querySelector('[data-status="main"]').textContent=text;}}
function inputVector(){const held=d=>keys.has(d)||Array.from(touches.values()).includes(d);let x=Number(held('right'))-Number(held('left')),y=Number(held('down'))-Number(held('up'));const n=Math.hypot(x,y);if(n>1){x/=n;y/=n;}return {x,y};}
function clearInput(){keys.clear();touches.clear();}
const SPECS={jab:{duration:.40,wind:.08,extend:.085,hold:.055,damage:8,knock:100},cross:{duration:.46,wind:.095,extend:.09,hold:.06,damage:10,knock:125},hook:{duration:.59,wind:.14,extend:.10,hold:.065,damage:16,knock:215},kick:{duration:.69,wind:.16,extend:.115,hold:.065,damage:20,knock:245},enemy:{duration:.88,wind:.32,extend:.12,hold:.07,damage:6,knock:100}};
function startAttack(a,kind){
 if(a.hp<=0||a.stun>0)return false;
 let step=kind==='punch'?(a.chain>0&&a.combo<3?a.combo+1:1):0;
 const name=a.isEnemy?'enemy':kind==='kick'?'kick':['jab','cross','hook'][step-1];
 a.attack={kind,step,name,t:0,hit:false,prev:null};a.chain=0;
 if(a===player&&enemy.hp>0)status(kind==='kick'?'בעיטה':`אגרוף ${step} מתוך 3`);
 return true;
}
function requestAttack(kind){
 if(player.hp<=0||player.stun>0)return false;
 sim.started=true;
 if(player.attack){
  if(player.queue.length>=3)return false;
  if(kind==='punch'&&(player.attack.kind!=='punch'||player.queue.includes('kick')||player.attack.step+player.queue.filter(x=>x==='punch').length>=3))return false;
  if(kind==='kick'&&player.queue.includes('kick'))return false;
  player.queue.push(kind);return true;
 }
 return startAttack(player,kind);
}
function attackPose(a){
 const at=a.attack;if(!at)return {reach:0,windup:0,stage:'guard',kind:'none',step:0,hand:false};
 const s=SPECS[at.name],t=at.t,end=s.wind+s.extend;
 let reach=0,windup=0,stage='guard';
 if(t<s.wind){windup=smooth(t/s.wind);stage='windup';}
 else if(t<end){reach=1-Math.pow(1-clamp((t-s.wind)/s.extend,0,1),3);windup=1-reach;stage='strike';}
 else if(t<end+s.hold){reach=1;stage='impact';}
 else {reach=1-smooth((t-end-s.hold)/(s.duration-end-s.hold));stage='recover';}
 return {reach,windup,stage,kind:at.kind,step:at.step,hand:at.step===2};
}
function solveLeg(hip,ankle,L1=65,L2=65){const dx=ankle.x-hip.x,dy=ankle.y-hip.y,raw=Math.max(.001,Math.hypot(dx,dy)),d=clamp(raw,.01,L1+L2-.1),ux=dx/raw,uy=dy/raw,A=(L1*L1-L2*L2+d*d)/(2*d),h=Math.sqrt(Math.max(0,L1*L1-A*A));return p(hip.x+ux*A+uy*h,hip.y+uy*A-ux*h);}
function foot(ph,ground,center){
 const q=((ph%(Math.PI*2))+Math.PI*2)%(Math.PI*2)/(Math.PI*2),stance=.62;let x,angle,lift=0;
 if(q<stance){const t=q/stance;x=lerp(38,-38,t);angle=t<.17?lerp(-.12,0,smooth(t/.17)):t>.78?.22*smooth((t-.78)/.22):0;}
 else {const t=(q-stance)/(1-stance),m=-76*(1-stance)/stance;x=(2*t*t*t-3*t*t+1)*-38+(t*t*t-2*t*t+t)*m+(-2*t*t*t+3*t*t)*38+(t*t*t-t*t)*m;lift=31*Math.pow(Math.sin(Math.PI*t),2);angle=lerp(.22,-.12,smooth(t))-.15*Math.pow(Math.sin(Math.PI*t),2);}
 const sole=Math.max(-24*Math.sin(angle)+29.35*Math.cos(angle),42*Math.sin(angle)+29.35*Math.cos(angle));
 return {x:center+x*state.strideX,y:ground+1.35-sole-lift+x/38*18*state.strideY,angle};
}
function idleMotion(a){
 const t=a.idleTime||0,seed=a.isEnemy?1.9:0;
 const fade=a.attack?1-smooth(a.attack.t/.065):1;
 const weight=(a.idleBlend??1)*(1-a.gait)*fade*(a.stun>0?0:1);
 const pulse=(phase,start,duration)=>{const u=(phase-start)/duration;return u>0&&u<1?Math.sin(Math.PI*u)**2:0;};
 const cycle=(t+seed*1.5)%8.4,breath=Math.sin(t*2.05+seed),blinkPhase=(t+seed*.7)%5.7;
 return {weight,breath:breath*weight,sway:(2.7*Math.sin(t*.88+seed)+.6*Math.sin(t*1.7+seed))*weight,
  scan:pulse(cycle,2.7,1.5)*weight,guard:pulse(cycle,5.0,1.25)*weight,
  hands:Math.sin(t*2.05+seed-.55)*weight,head:Math.sin(t*.93+seed-.3)*.018*weight,blink:weight>.92&&blinkPhase>5.50&&blinkPhase<5.65};
}
function bodyPose(a,live=false){
 if(a.hp<=0&&!live){if(!a.deathFrames)captureKnockout(a);return knockoutPose(a);}
 const attack=attackPose(a),pu=attack.kind==='punch'?attack.reach:0,kick=attack.kind==='kick'?attack.reach:0,wind=attack.windup,gait=a.gait,ph=a.phase;
 const idle=idleMotion(a),breath=Math.sin(a.time*2.1)*(1-gait)*(1-Math.max(pu,kick)),bob=2.6*Math.cos(ph*2)*gait+.35*breath,twist=Math.sin(ph+.35)*gait;
 const recoil=-11*clamp(a.stun/.22,0,1),heavy=attack.step===3?1.2:1;
 const hip=p(250+2.8*Math.sin(ph)*gait+pu*3-wind+idle.sway,242-14*(1-gait)+bob+kick*3+idle.breath*.85+idle.guard*.5);
 const neck=p(hip.x+3+3.2*twist+pu*15*heavy-wind*5-kick*11+recoil+idle.sway*.3+idle.scan*.6,hip.y-105+1.2*Math.sin(ph*2-.3)*gait-.9*breath-idle.breath*1.8-idle.guard*.9);
 function blend(phase,center,idleX){const f=foot(phase,382,center);return {...f,x:lerp(idleX,f.x,gait),y:lerp(354,f.y,gait),angle:f.angle*gait};}
 const back=blend(ph+Math.PI,243,226),front=blend(ph,257,274),leftHip=shift(hip,-8,1.2*Math.sin(ph)*gait),rightHip=shift(hip,8,-1.2*Math.sin(ph)*gait);
 if(attack.kind==='kick'){
  const chamber=p(rightHip.x+22,rightHip.y+62),target=p(rightHip.x+116,rightHip.y-2);
  const prep=wind*(1-kick);front.x=lerp(lerp(front.x,chamber.x,prep),target.x,kick);front.y=lerp(lerp(front.y,chamber.y,prep),target.y,kick);front.angle=lerp(0,-.12,kick);
 }
 const farShoulder=shift(neck,-6-2*twist,16-1.5*twist-idle.breath*.4-idle.guard*.65),nearShoulder=shift(neck,-36+2*twist+3*pu,27+1.5*twist-idle.breath*.7-idle.guard);
 const headAngle=-.035-Math.sin(ph)*.012*gait-pu*.025+idle.head-idle.scan*.055+idle.guard*.022;
 return {hip,neck,back,front,leftHip,rightHip,farShoulder,nearShoulder,attack,pu,kick,wind,ph,gait,idle,headAngle};
}
const rotatePoint=(v,r)=>p(v.x*Math.cos(r)-v.y*Math.sin(r),v.x*Math.sin(r)+v.y*Math.cos(r));
const boneAngle=(a,b)=>Math.atan2(b.x-a.x,b.y-a.y);
function mixAngle(a,b,t){const delta=Math.atan2(Math.sin(b-a),Math.cos(b-a));return a+delta*t;}
function captureKnockout(a){
 const previous=state;state=a;const pose=bodyPose(a,true),near=armPose(a,false,pose.nearShoulder,pose),far=armPose(a,true,pose.farShoulder,pose);
 const nk=solveLeg(pose.rightHip,pose.front),fk=solveLeg(pose.leftHip,pose.back);
 const localDir=1,seed={t:0,hip:pose.hip,spine:boneAngle(pose.hip,pose.neck),nearLeg:[boneAngle(pose.rightHip,nk),boneAngle(nk,pose.front)],farLeg:[boneAngle(pose.leftHip,fk),boneAngle(fk,pose.back)],nearArm:[boneAngle(near.shoulder,near.elbow),boneAngle(near.elbow,near.wrist)],farArm:[boneAngle(far.shoulder,far.elbow),boneAngle(far.elbow,far.wrist)],bootNear:pose.front.angle,bootFar:pose.back.angle,head:pose.headAngle??(-.035-Math.sin(a.phase)*.012*a.gait)};
 a.deathScale=scaleOf(a);a.deathX=a.x;a.deathY=a.y;a.deathDir=localDir;a.spineLength=Math.hypot(pose.neck.x-pose.hip.x,pose.neck.y-pose.hip.y);
 const kneelHip=p(250,303),kneelSpine=Math.PI-localDir*.30,r=Math.PI-kneelSpine;
 const lh=shift(kneelHip,...Object.values(rotatePoint(p(-8,0),r))),rh=shift(kneelHip,...Object.values(rotatePoint(p(8,1),r)));
 const nearFoot=p(clamp(pose.front.x,220,286),354),farFoot=p(clamp(pose.back.x,214,280),354),nkk=solveLeg(rh,nearFoot),fkk=solveLeg(lh,farFoot);
 const kneel={t:.42,hip:kneelHip,spine:kneelSpine,nearLeg:[boneAngle(rh,nkk),boneAngle(nkk,nearFoot)],farLeg:[boneAngle(lh,fkk),boneAngle(fkk,farFoot)],nearArm:[.18,localDir*.18],farArm:[-.18,-localDir*.1],bootNear:0,bootFar:0,head:localDir*.34};
 const rest={t:1.25,hip:p(232,338),spine:Math.PI-localDir*Math.PI/2,nearLeg:[-localDir*1.25,-localDir*1.72],farLeg:[-localDir*1.50,-localDir*1.35],nearArm:[localDir*.42,-localDir*1.45],farArm:[-localDir*1.45,-localDir*1.03],bootNear:-localDir*1.72,bootFar:-localDir*1.35,head:localDir*Math.PI/2};
 // Mirror the horizontal hip shift when the actor falls to the other side.
 rest.hip.x=250-localDir*18;
 const recoil={...seed,t:.18,hip:p(seed.hip.x-localDir*4,seed.hip.y+10),spine:seed.spine+localDir*.12,nearArm:[seed.nearArm[0],.9],farArm:[seed.farArm[0],.8],head:seed.head-localDir*.16};
 const midHip=p(242,303),midSpine=Math.PI-localDir*1.05,mr=Math.PI-midSpine;
 const ml=rotatePoint(p(-8,0),mr),mn=rotatePoint(p(8,1),mr),mfar=shift(midHip,ml.x,ml.y),mnear=shift(midHip,mn.x,mn.y);
 const mf=p(mfar.x-55,354),nf=p(mnear.x-55,354),mkf=solveLeg(mfar,mf),mkn=solveLeg(mnear,nf);
 const tip={...kneel,t:.60,hip:midHip,spine:midSpine,nearLeg:[boneAngle(mnear,mkn),boneAngle(mkn,nf)],farLeg:[boneAngle(mfar,mkf),boneAngle(mkf,mf)],nearArm:[localDir*.36,-localDir*.70],farArm:[-localDir*.65,-localDir*.55],head:localDir*1.12};
 const contact={...rest,t:.78,hip:p(rest.hip.x,338),spine:Math.PI-localDir*1.50,head:localDir*1.48};
 const rebound={...rest,t:.94,hip:p(rest.hip.x,333),spine:Math.PI-localDir*1.64,head:localDir*1.66};
 a.deathFrames=[seed,recoil,kneel,tip,contact,rebound,rest];state=previous;
}
function knockoutPose(a){
 const frames=a.deathFrames,t=a.deadTime;let i=0;while(i<frames.length-2&&t>frames[i+1].t)i++;
 const from=frames[i],to=frames[i+1],u=smooth((t-from.t)/(to.t-from.t));
 const hip=p(lerp(from.hip.x,to.hip.x,u),lerp(from.hip.y,to.hip.y,u)),spine=mixAngle(from.spine,to.spine,u),r=Math.PI-spine,neck=extend(hip,a.spineLength,spine);
 const offset=v=>{const q=rotatePoint(v,r);return shift(hip,q.x,q.y);},shoulder=v=>{const q=rotatePoint(v,r);return shift(neck,q.x,q.y);};
 const pair=name=>[mixAngle(from[name][0],to[name][0],u),mixAngle(from[name][1],to[name][1],u)];
 const nearAngles=pair('nearArm'),farAngles=pair('farArm'),nl=pair('nearLeg'),fl=pair('farLeg'),leftHip=offset(p(-8,0)),rightHip=offset(p(8,1));
 const frontKnee=extend(rightHip,65,nl[0]),backKnee=extend(leftHip,65,fl[0]),front=extend(frontKnee,65,nl[1]),back=extend(backKnee,65,fl[1]);
 front.angle=mixAngle(from.bootNear,to.bootNear,u);back.angle=mixAngle(from.bootFar,to.bootFar,u);
 const h=rotatePoint(p(-4,-10),r);
 return {knockedOut:true,hip,neck,leftHip,rightHip,front,back,frontKnee,backKnee,nearAngles,farAngles,nearShoulder:shoulder(p(-36,27)),farShoulder:shoulder(p(-6,16)),bodyRotation:r,headOrigin:shift(neck,h.x,h.y),headAngle:mixAngle(from.head,to.head,u),attack:{kind:'none',reach:0,windup:0},pu:0,kick:0,wind:0,gait:0,ph:a.phase};
}
function armPose(a,far,shoulder,pose){
 if(pose.knockedOut){const angles=far?pose.farAngles:pose.nearAngles,elbow=extend(shoulder,55,angles[0]),wrist=extend(elbow,55,angles[1]);return {shoulder,elbow,wrist};}
 const at=pose.attack,breathe=Math.sin(a.time*2.1)*(1-a.gait),active=at.kind==='punch'&&far===at.hand,idle=pose.idle||{hands:0,guard:0};
 let angle=(far?-.21:.21)+Math.sin(pose.ph+(far?Math.PI:0))*(far?-.38:.38)*a.gait+breathe*.012+(far?-.028:.035)*idle.hands+(far?-.055:.09)*idle.guard,bend=1.95+breathe*.015-idle.hands*.045-idle.guard*(far?.08:.13);
 if(active){angle-=.30*at.windup;bend+=.2*at.windup;angle=lerp(angle,at.step===3?1.90:1.50,at.reach);bend=lerp(bend,at.step===3?1.0:1.43,at.reach);}
 else {angle-=.16*pose.pu+.1*pose.kick;bend+=.20*pose.pu;}
 const elbow=extend(shoulder,55,angle),wrist=extend(elbow,55,bend+Math.sin(pose.ph)*.12*a.gait*(1-pose.pu));return {shoulder,elbow,wrist};
}
function worldPoint(a,p0){const s=scaleOf(a);return {x:a.x+(p0.x-250)*s*a.facing,y:a.y+(p0.y-382)*s};}
function strikePoint(a){const prev=state;state=a;const pose=bodyPose(a),at=pose.attack,point=at.kind==='kick'?shift(pose.front,20,5):armPose(a,at.hand,at.hand?pose.farShoulder:pose.nearShoulder,pose).wrist;state=prev;return worldPoint(a,point);}
function updateMove(a,dir,dt,ai=false){
 if(a.hp<=0){a.x=a.deathX??a.x;a.y=a.deathY??a.y;a.vx=a.vy=a.kb=a.gait=0;a.playing=false;a.idleBlend=0;return;}
 const scale=scaleOf(a),factor=a.stun>0||a.hp<=0?0:a.attack?.kind==='kick'?0:a.attack?.kind==='punch'?.20:1,rate=ai?.44:1;
 a.vx=lerp(a.vx,dir.x*141*scale*factor*rate,1-Math.exp(-dt*14));a.vy=lerp(a.vy,dir.y*67*scale*factor*rate,1-Math.exp(-dt*14));
 if(Math.abs(a.vx)<.05)a.vx=0;if(Math.abs(a.vy)<.05)a.vy=0;
 a.x=clamp(a.x+(a.vx+a.kb)*dt,MIN_X,MAX_X);a.y=clamp(a.y+a.vy*dt,342,406);a.kb*=Math.exp(-dt*12);
 if((a.x===MIN_X&&a.vx<0)||(a.x===MAX_X&&a.vx>0))a.vx=0;if((a.y===342&&a.vy<0)||(a.y===406&&a.vy>0))a.vy=0;
 if(Math.abs(dir.x)>.05&&!a.attack&&a.stun<=0)a.facing=dir.x>0?1:-1;
 const nx=a.vx/(141*scale),ny=a.vy/(67*scale),speed=Math.hypot(nx,ny);a.gait=clamp(speed,0,1);a.playing=speed>.006;
 if(speed>.006){a.strideX=Math.abs(nx)/speed;a.strideY=ny/speed;a.phase+=dt*2*Math.PI*1.15*a.gait;}
 const resting=!a.attack&&a.stun<=0&&speed<.025&&Math.abs(a.kb)<1;
 a.idleBlend=lerp(a.idleBlend??1,resting?1:0,1-Math.exp(-dt*(resting?5:18)));
 if(resting)a.idleTime=(a.idleTime||0)+dt;
}
function enemyIntent(dt){
 if(!sim.started||!sim.ai||enemy.hp<=0||player.hp<=0||enemy.stun>0||enemy.attack)return p(0,0);
 const dx=player.x-enemy.x,dy=player.y-enemy.y;enemy.facing=dx>0?1:-1;
 if(Math.abs(dx)<99&&Math.abs(dy)<14){if(enemy.cooldown<=0){startAttack(enemy,'punch');enemy.cooldown=1.45;}return p(0,0);}
 let x=Math.abs(dx)>86?Math.sign(dx):0,y=Math.abs(dy)>6?Math.sign(dy):0,n=Math.hypot(x,y);return n>1?p(x/n,y/n):p(x,y);
}
function damage(from,to,spec,point){
 if(to.hp<=0)return;
 if(to.hp<=spec.damage)captureKnockout(to);
 to.hp=Math.max(0,to.hp-spec.damage);to.stun=spec.damage>=16?.27:.17;to.flash=.075;to.kb=from.facing*spec.knock;
 to.attack=null;to.queue.length=0;to.combo=0;to.chain=0;to.cooldown=.9;
 sim.hitstop=.045;sim.shake=.13;sim.hits.push({from:from.isEnemy?'enemy':'player',kind:from.attack.kind,step:from.attack.step,damage:spec.damage});
 bloodBurst(from,to,spec,point);to.wounds=Math.min(4,(to.wounds||0)+(spec.damage>=16?2:1));
 for(let i=0;i<7;i++){const theta=i*Math.PI*2/7;sim.particles.push({x:point.x,y:point.y,vx:Math.cos(theta)*95,vy:Math.sin(theta)*80,life:.18});}
 if(to.hp<=0){to.deadTime=0;status(to===enemy?'ניצחון! הדרך פתוחה — אפשר להמשיך לאורך הכביש':'הובסת — סיבוב חדש לניסיון נוסף');clearInput();}
 else if(from===player)status(from.attack.kind==='kick'?'בעיטה פגעה':`פגיעה — אגרוף ${from.attack.step} מתוך 3`);
 else status('נפגעת — אפשר לזוז הצידה ולחזור לטווח');
}
function checkHit(from,to){
 const at=from.attack;if(!at||at.hit||from.hp<=0||to.hp<=0)return;
 const spec=SPECS[at.name],point=strikePoint(from),previous=at.prev||point;at.prev=point;
 if(at.t<spec.wind+spec.extend*.55||at.t>spec.wind+spec.extend+spec.hold)return;
 if(Math.abs(from.y-to.y)>22||(to.x-from.x)*from.facing<12)return;
 const scale=scaleOf(to),radius=(at.kind==='kick'?12:9)*scaleOf(from),cx=to.x+to.facing*2,cy=to.y-184*scale,rx=38*scale+radius,ry=65*scale+radius;
 for(let i=0;i<=5;i++){const t=i/5,x=lerp(previous.x,point.x,t),y=lerp(previous.y,point.y,t);if(((x-cx)/rx)**2+((y-cy)/ry)**2<=1){at.hit=true;damage(from,to,spec,p(x,y));break;}}
}
function advanceActor(a,dt){
 a.time+=dt;a.stun=Math.max(0,a.stun-dt);a.flash=Math.max(0,a.flash-dt);a.cooldown=Math.max(0,a.cooldown-dt);a.chain=Math.max(0,a.chain-dt);
 if(a.hp<=0){a.deadTime+=dt;a.gait=0;const s=a.spring;for(let n=0;n<3;n++){const h=dt/3;s.v+=(-s.a*70-s.v*15)*h;s.a+=s.v*h;s.w+=((42-s.b)*55-s.w*13)*h;s.b+=s.w*h;}return;}
 if(a.attack){a.attack.t+=dt;if(a.attack.t>SPECS[a.attack.name].duration){a.combo=a.attack.kind==='punch'?a.attack.step:0;a.chain=.32;a.attack=null;const queued=a.queue.shift();if(queued)startAttack(a,queued);}}
 const targetA=-.12-a.wind*.25+(a.playing?.04*Math.sin(a.phase):0),targetB=20-a.wind*40+(a.playing?9*Math.sin(a.phase-1):0),s=a.spring;
 for(let n=0;n<3;n++){const h=dt/3;s.v+=((targetA-s.a)*80-s.v*12)*h;s.a+=s.v*h;s.w+=((targetB-s.b)*65-s.w*9)*h;s.b+=s.w*h;}
}
function update(dt){
 updateBlood(dt);
 sim.time+=dt;sim.shake=Math.max(0,sim.shake-dt);for(const q of sim.particles){q.x+=q.vx*dt;q.y+=q.vy*dt;q.life-=dt;}sim.particles=sim.particles.filter(q=>q.life>0);
 if(sim.hitstop>0){sim.hitstop=Math.max(0,sim.hitstop-dt);return;}
 advanceActor(player,dt);advanceActor(enemy,dt);
 const input=inputVector();if(input.x||input.y)sim.started=true;
 updateMove(player,input,dt);updateMove(enemy,enemyIntent(dt),dt,true);
 if(player.hp>0&&enemy.hp>0&&Math.abs(player.y-enemy.y)<21){const dx=enemy.x-player.x;if(Math.abs(dx)<52){const sign=dx>=0?1:-1,push=(52-Math.abs(dx))/2;player.x=clamp(player.x-sign*push,MIN_X,MAX_X);enemy.x=clamp(enemy.x+sign*push,MIN_X,MAX_X);}}
 checkHit(player,enemy);checkHit(enemy,player);
 updateCamera(dt);
}
function updateCamera(dt){
 camera.target=clamp(player.x-VIEW_WIDTH*.43+player.vx*.14,0,WORLD_WIDTH-VIEW_WIDTH);
 camera.x=lerp(camera.x,camera.target,1-Math.exp(-dt*6));
 if(Math.abs(camera.x-camera.target)<.01)camera.x=camera.target;
}
let panoramaImage=null;
function loadPanorama(){
 if(panoramaImage)return Promise.resolve(panoramaImage);
 return new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>{panoramaImage=im;resolve(im);};im.onerror=reject;im.src=SCENERY;});
}
async function stageBitmap(c){
 if(typeof createImageBitmap==='function')return createImageBitmap(c);
 return new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=c.toDataURL('image/png');});
}
async function prepareStage(){
 const revision=++sceneEpoch,im=await loadPanorama(),layers=[];
 // The painted panorama stays behind the actors; only the road tracks world movement.
 const back=document.createElement('canvas');back.width=Math.ceil(VIEW_WIDTH+(WORLD_WIDTH-VIEW_WIDTH)*.38)+4;back.height=VIEW_HEIGHT;
 back.getContext('2d').drawImage(im,0,0,back.width,VIEW_HEIGHT);
 layers.push({rate:.38,image:await stageBitmap(back)});
 const road=document.createElement('canvas');road.width=WORLD_WIDTH+4;road.height=VIEW_HEIGHT;const g=road.getContext('2d');
 const roadY=312,tileWidth=VIEW_HEIGHT*im.width/im.height,sourceY=roadY/VIEW_HEIGHT*im.height;
 for(let n=0,x=0;x<road.width;n++,x+=tileWidth){
  g.save();g.translate(x+(n%2?tileWidth:0),0);if(n%2)g.scale(-1,1);
  g.drawImage(im,0,sourceY,im.width,im.height-sourceY,0,roadY,tileWidth,VIEW_HEIGHT-roadY);g.restore();
 }
 // A narrow fade keeps the two scrolling planes joined without a hard horizontal seam.
 const mask=g.createLinearGradient(0,roadY,0,roadY+18);mask.addColorStop(0,'rgba(0,0,0,0)');mask.addColorStop(1,'rgba(0,0,0,1)');
 g.globalCompositeOperation='destination-in';g.fillStyle=mask;g.fillRect(0,0,road.width,road.height);g.globalCompositeOperation='source-over';
 layers.push({rate:1,image:await stageBitmap(road)});
 if(revision===sceneEpoch){for(const layer of stageCache)layer.image.close?.();stageCache=layers;}
 else for(const layer of layers)layer.image.close?.();
}
function drawAtmosphere(){
 ctx.save();ctx.fillStyle=theme.impact;
 for(let i=0;i<18;i++){
  const span=VIEW_WIDTH+60,x=((i*97+sim.time*(8+i%4)-camera.x*.65)%span+span)%span-30;
  const y=238+(i*43)%133+Math.sin(sim.time*.45+i*2)*5;
  ctx.globalAlpha=.06+(i%3)*.025;ctx.beginPath();ctx.ellipse(x,y,.6+i%3*.27,.4+i%2*.18,0,0,Math.PI*2);ctx.fill();
 }
 ctx.restore();
}

 function drawPiece(name,a,b,width,opts={}){
  const im=partImage(name,opts.dark);if(!im)return;
  const pivots={torso:[.64,.055,.48,.88],upperArm:[.49,.18,.55,.88],farUpperArm:[.48,.18,.59,.88],forearm:[.17,.15,.78,.79],farForearm:[.19,.15,.78,.79],thigh:[.43,.1,.59,.83],farThigh:[.43,.1,.59,.83],shin:[.42,.1,.42,.72],farShin:[.42,.1,.42,.72]};
  const v=opts.pivots||pivots[name]||[.5,0,.5,1],sx=v[0]*im.width,sy=v[1]*im.height,tx=v[2]*im.width,ty=v[3]*im.height;
  const worldAngle=Math.atan2(b.y-a.y,b.x-a.x),sourceAngle=Math.atan2(ty-sy,tx-sx),len=Math.hypot(b.x-a.x,b.y-a.y),scale=len/Math.hypot(tx-sx,ty-sy);
  ctx.save();ctx.translate(a.x+(opts.ex||0)*state.explodeT,a.y+(opts.ey||0)*state.explodeT);ctx.rotate(worldAngle);
  
  ctx.scale(scale,scale*(opts.thickness||1));ctx.rotate(-sourceAngle);
  if(opts.clip){const y=im.height*opts.clip[0],h=im.height*(opts.clip[1]-opts.clip[0]);ctx.drawImage(im,0,y,im.width,h,-sx,y-sy,im.width,h);}
  else ctx.drawImage(im,-sx,-sy);
  if(name==='torso'){ctx.save();ctx.translate(-sx,-sy);drawWounds(state,'torso',im.width,im.height);ctx.restore();}
  ctx.restore();
 }

 function drawLeg(far,hip,ankle,kneeOverride){
  const knee=kneeOverride||solveLeg(hip,ankle); const ex=far?-50:58,ey=far?15:22;
  const name=far?'farShin':'shin',im=partImage(name,far);
  // Keep one knee guard on the thigh; exclude the duplicate painted on the shin.
  drawPiece(name,knee,ankle,far?48:54,{ex,ey,dark:far,clip:[.34,.72],pivots:[.42,.28,.42,.72],thickness:.71});
  if(im){const scale=65/(im.height*.62),cut=im.height*.59;ctx.save();ctx.translate(ankle.x+ex*state.explodeT,ankle.y+ey*state.explodeT);ctx.rotate(ankle.angle||0);ctx.drawImage(im,0,cut,im.width,im.height-cut,-im.width*.42*scale,(cut-im.height*.72)*scale,im.width*scale,(im.height-cut)*scale);ctx.restore();}
  // Foreground thigh covers the overlap at the bending knee.
  drawPiece(far?'farThigh':'thigh',hip,knee,far?42:48,{extra:17,top:9,ex,ey,dark:far});
  bone(hip,knee);bone(knee,ankle);
 }

 function scarf(neck){
  const im=partImage('scarfTail');if(!im)return;
  const baseX=neck.x-10,baseY=neck.y+9,expl=state.explodeT;
  ctx.save();ctx.translate(baseX-55*expl,baseY-28*expl);ctx.rotate(spring.a);
  // A contiguous textured strip is deformed along a spring-driven curve.
  const N=16,L=118,H=44;
  for(let i=0;i<N;i++){
   const t=i/N,t2=(i+1)/N,dx=-L*t,dx2=-L*t2;
   const curve=u=>spring.b*u*u+8*Math.sin(u*5-state.time*7)*u*state.wind;
   const dy=curve(t),dy2=curve(t2),ang=Math.atan2(dy2-dy,dx2-dx)-Math.PI;
   ctx.save();ctx.translate(dx,dy);ctx.rotate(ang);ctx.drawImage(im,im.width*(1-t2),0,im.width/N+1,im.height,-L/N-1,-H/2,L/N+2,H);ctx.restore();
  }
  ctx.restore();
 }

function bone(a,b){joints.push([a,b]);}
function drawArmRig(a,far,pose){const arm=armPose(a,far,far?pose.farShoulder:pose.nearShoulder,pose),ex=far?-45:52,ey=far?-8:-6;drawPiece(far?'farUpperArm':'upperArm',arm.shoulder,arm.elbow,44,{ex,ey,dark:far,thickness:1.18});drawPiece(far?'farForearm':'forearm',arm.elbow,arm.wrist,40,{ex,ey,dark:far,thickness:1.18});bone(arm.shoulder,arm.elbow);bone(arm.elbow,arm.wrist);}
function drawActor(a){
 state=a;spring=a.spring;joints.length=0;const pose=bodyPose(a),s=scaleOf(a),fall=a.hp<=0?smooth(a.deadTime/.95):0;
 ctx.save();ctx.translate(lerp(a.x,clamp(a.x,MIN_X+60,MAX_X-60),fall),a.y);ctx.scale(s*a.facing,s);ctx.translate(-250,-382);
 ctx.save();ctx.fillStyle=theme.muted;ctx.globalAlpha=.13;ctx.beginPath();ctx.ellipse(250,384,lerp(77,171,fall),lerp(8,13,fall),0,0,Math.PI*2);ctx.fill();ctx.restore();
 if(pose.knockedOut){const o=rotatePoint(p(-10,9),pose.bodyRotation),oldWind=state.wind;state.wind=0;scarf(shift(pose.neck,o.x+10,o.y-9));state.wind=oldWind;}else scarf(pose.neck);
 drawArmRig(a,true,pose);drawLeg(true,pose.leftHip,pose.back,pose.backKnee);drawLeg(false,pose.rightHip,pose.front,pose.frontKnee);
 drawPiece('torso',pose.neck,shift(pose.hip,0,10),90,{});bone(pose.neck,pose.hip);
 const h=partImage((pose.knockedOut&&a.deadTime>.16)||pose.idle?.blink?'headKO':'head'),origin=pose.headOrigin||shift(pose.neck,-4,-10);
 ctx.save();ctx.translate(origin.x,origin.y);ctx.rotate(pose.headAngle??(-.035-Math.sin(pose.ph)*.012*a.gait-pose.pu*.025));ctx.drawImage(h,-42,-65,90,104);ctx.translate(-42,-65);drawWounds(a,'head',90,104);ctx.restore();
 drawArmRig(a,false,pose);bone(pose.neck,shift(pose.neck,-4,-33));
 if(player.bones){ctx.save();ctx.filter='none';ctx.strokeStyle=theme.bone;ctx.fillStyle=theme.bone;ctx.lineWidth=2;for(const[x,y]of joints){ctx.beginPath();ctx.moveTo(x.x,x.y);ctx.lineTo(y.x,y.y);ctx.stroke();for(const q of[x,y]){ctx.beginPath();ctx.arc(q.x,q.y,3,0,Math.PI*2);ctx.fill();}}ctx.restore();}
 ctx.restore();
}
function updateHUD(){const cache=player.hp+':'+enemy.hp;if(cache===healthCache)return;healthCache=cache;for(const[name,a]of[['player',player],['enemy',enemy]]){root.querySelector(`[data-hp="${name}"]`).textContent=String(a.hp);const bar=root.querySelector(`[data-health="${name}"]`);bar.setAttribute('aria-valuenow',String(a.hp));bar.querySelector('.progress-bar').style.width=a.hp+'%';}}
function drawEnemyIndicator(){
 if(enemy.hp<=0||!sim.started)return;
 const x=enemy.x-camera.x;if(x>=20&&x<=VIEW_WIDTH-20)return;
 const side=x<20?-1:1;
 ctx.save();ctx.translate(side<0?22:VIEW_WIDTH-22,205);ctx.scale(side,1);
 ctx.globalAlpha=.78;ctx.fillStyle=theme.bg;ctx.beginPath();ctx.ellipse(0,0,16,20,0,0,Math.PI*2);ctx.fill();
 ctx.globalAlpha=1;ctx.strokeStyle=theme.red;ctx.lineWidth=2.5;ctx.lineCap='round';ctx.lineJoin='round';
 ctx.beginPath();ctx.moveTo(-5,-7);ctx.lineTo(4,0);ctx.lineTo(-5,7);ctx.stroke();ctx.restore();
}
function render(){
 ctx.clearRect(0,0,VIEW_WIDTH,VIEW_HEIGHT);ctx.save();if(sim.shake>0)ctx.translate(Math.sin(sim.time*170)*1.6,Math.cos(sim.time*150)*1.0);
 for(const layer of stageCache)ctx.drawImage(layer.image,camera.x*layer.rate,0,VIEW_WIDTH,VIEW_HEIGHT,0,0,VIEW_WIDTH,VIEW_HEIGHT);
 drawAtmosphere();
 ctx.translate(-camera.x,0);
 drawBlood(true);
 for(const a of[player,enemy].sort((a,b)=>Math.abs(a.y-b.y)>3?a.y-b.y:Number(Boolean(a.attack))-Number(Boolean(b.attack))))drawActor(a);
 drawBlood(false);
 ctx.save();ctx.filter='none';ctx.strokeStyle=theme.impact;ctx.lineWidth=2.5;for(const q of sim.particles){ctx.globalAlpha=q.life/.18;ctx.beginPath();ctx.moveTo(q.x,q.y);ctx.lineTo(q.x-q.vx*.045,q.y-q.vy*.045);ctx.stroke();}ctx.restore();ctx.restore();drawEnemyIndicator();state=player;spring=player.spring;updateHUD();
}
function tick(ts){
 if(document.hidden||!visible){last=null;accumulator=0;raf=requestAnimationFrame(tick);return;}
 if(last===null)last=ts;
 accumulator+=clamp((ts-last)/1000,0,.25)*PLAYBACK_RATE;last=ts;
 let steps=0;while(accumulator+1e-10>=STEP&&steps<40){update(STEP);accumulator=Math.max(0,accumulator-STEP);steps++;}
 render();raf=requestAnimationFrame(tick);
}
function reset(){const bones=player.bones;Object.assign(player,makeActor(false));player.bones=bones;Object.assign(enemy,makeActor(true));enemy.x=490;clearInput();camera.x=camera.target=0;sim.time=0;sim.hitstop=0;sim.shake=0;sim.particles=[];sim.blood=[];sim.stains=[];sim.hits=[];sim.started=false;healthCache='';last=null;accumulator=0;status('דרך הגרוטאות · התקדם לאורך הכביש ופגוש את הפושט');if(ready)render();}
function previewKnockout(){reset();captureKnockout(enemy);enemy.hp=0;enemy.attack=null;enemy.queue.length=0;sim.started=true;status('הדגמת עילפון · סיבוב חדש מחזיר לקרב');}
root.querySelector('[data-action="punch"]').onclick=()=>requestAttack('punch');root.querySelector('[data-action="kick"]').onclick=()=>requestAttack('kick');root.querySelector('[data-action="reset"]').onclick=reset;
root.querySelector('[data-action="preview-ko"]').onclick=previewKnockout;
root.querySelector('[data-action="bones"]').onchange=e=>player.bones=e.target.checked;
for(const dir of['up','down','left','right']){const button=root.querySelector(`[data-dir="${dir}"]`);button.onpointerdown=e=>{e.preventDefault();button.focus?.({preventScroll:true});button.setPointerCapture?.(e.pointerId);touches.set(e.pointerId,dir);};button.onpointerup=button.onpointercancel=button.onlostpointercapture=e=>touches.delete(e.pointerId);}
const keyDirections={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',KeyW:'up',KeyS:'down',KeyA:'left',KeyD:'right'};
if(window.addEventListener){window.addEventListener('keydown',e=>{if(e.target?.tagName==='INPUT')return;const dir=keyDirections[e.code];if(dir){e.preventDefault();keys.add(dir);}else if(!e.repeat&&(e.code==='KeyJ'||e.code==='KeyK')){e.preventDefault();requestAttack(e.code==='KeyJ'?'punch':'kick');}});window.addEventListener('keyup',e=>{const dir=keyDirections[e.code];if(dir){e.preventDefault();keys.delete(dir);}});window.addEventListener('blur',clearInput);}
if(document.addEventListener)document.addEventListener('visibilitychange',()=>{if(document.hidden)clearInput();last=null;accumulator=0;});
if(typeof IntersectionObserver==='function'){const observer=new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting!==false;if(!visible)clearInput();last=null;accumulator=0;});observer.observe(root);}
Promise.all(Object.entries(ASSETS).map(([name,src])=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>{imgs[name]=im;resolve();};im.onerror=reject;im.src=src;}))).then(async()=>{await Promise.all([prepareSprites(),prepareStage()]);ready=true;reset();raf=requestAnimationFrame(tick);}).catch(()=>status('לא ניתן לטעון את הזירה והדמויות'));
window.rookCombat={player,enemy,sim,camera,world:{width:WORLD_WIDTH,viewWidth:VIEW_WIDTH,minX:MIN_X,maxX:MAX_X},requestAttack,attackPose,strikePoint,bodyPose,armPose,captureKnockout,scaleOf,update,render,reset,previewKnockout,ready:()=>ready,controls:{press:d=>keys.add(d),release:d=>keys.delete(d),clear:clearInput},stop:()=>cancelAnimationFrame(raf)};

})();
