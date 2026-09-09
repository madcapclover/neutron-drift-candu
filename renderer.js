import { ARENA_RADIUS as R, CENTER as C, CONFIG, GamePhase } from './engine.js';

const TAU = Math.PI * 2;
const colors = { fast: '#ff8265', resonance: '#ffc465', thermal: '#7effed' };
const circle = (ctx, x, y, r) => { ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, TAU); };
function halo(ctx, x, y, radius, color, strength = 1) {
  const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
  glow.addColorStop(0, color); glow.addColorStop(1, 'transparent');
  ctx.save(); ctx.globalAlpha *= strength; ctx.fillStyle = glow;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2); ctx.restore();
}

// Static machining and channel assemblies are rasterized once, not every frame.
let chamber;
const fuelSprites = new Map();
function chamberImage() {
  if (chamber) return chamber;
  chamber = document.createElement('canvas'); chamber.width = chamber.height = 1600;
  const ctx = chamber.getContext('2d'); ctx.scale(1.6, 1.6);
  ctx.fillStyle = '#040b14'; ctx.fillRect(0, 0, 1000, 1000);
  halo(ctx, C, C, 495, '#174151');
  const metal = ctx.createLinearGradient(80, 60, 880, 960);
  [[0,'#69818b'],[.12,'#233e50'],[.38,'#0c1d2b'],[.52,'#4b6775'],[.62,'#142b3d'],[1,'#63878f']].forEach(([p,c]) => metal.addColorStop(p,c));
  circle(ctx,C,C,R+24); ctx.fillStyle=metal; ctx.fill();
  for (const radius of [R+28,R+24,R+19,R+9,R+3]) {
    circle(ctx,C,C,radius); ctx.strokeStyle='rgba(141,208,225,.22)'; ctx.lineWidth=1; ctx.stroke();
  }
  const water = ctx.createRadialGradient(390,310,20,C,C,R);
  water.addColorStop(0,'#123446'); water.addColorStop(.6,'#09202e'); water.addColorStop(1,'#05131f');
  circle(ctx,C,C,R); ctx.fillStyle=water; ctx.fill();
  ctx.save(); circle(ctx,C,C,R-2); ctx.clip();
  for(let y=60;y<950;y+=32) for(let x=60;x<950;x+=32) {
    ctx.fillStyle='rgba(107,183,214,.10)'; ctx.fillRect(x,y,1,1);
  }
  for(let radius=100;radius<R;radius+=100) {
    circle(ctx,C,C,radius); ctx.strokeStyle='rgba(109,186,211,.065)'; ctx.stroke();
  }
  ctx.strokeStyle='rgba(118,190,214,.065)'; ctx.beginPath();
  ctx.moveTo(C,40);ctx.lineTo(C,960);ctx.moveTo(40,C);ctx.lineTo(960,C);ctx.stroke();
  ctx.restore();
  for(let i=0;i<120;i++) {
    const a=i*TAU/120, major=i%5===0;
    ctx.strokeStyle=major?'#87becb':'#385d71';ctx.lineWidth=major?2:1;
    ctx.beginPath();ctx.moveTo(C+Math.cos(a)*(R+10),C+Math.sin(a)*(R+10));
    ctx.lineTo(C+Math.cos(a)*(R+(major?19:14)),C+Math.sin(a)*(R+(major?19:14)));ctx.stroke();
    if(i%10===0) {
      circle(ctx,C+Math.cos(a)*(R+24),C+Math.sin(a)*(R+24),3);
      ctx.fillStyle='#07121d';ctx.fill();ctx.strokeStyle='#668595';ctx.stroke();
    }
  }
  circle(ctx,C,C,R);ctx.strokeStyle='#55d3df';ctx.lineWidth=1.5;ctx.stroke();
  return chamber;
}
function fuelImage(poisoned) {
  if(fuelSprites.has(poisoned)) return fuelSprites.get(poisoned);
  const sprite=document.createElement('canvas');sprite.width=sprite.height=256;
  const ctx=sprite.getContext('2d');ctx.scale(2,2);ctx.translate(64,64);
  const hot=poisoned?'#9dff59':'#ffb567';
  halo(ctx,0,0,61,poisoned?'#44821e':'#753c1e',.6);
  circle(ctx,1,4,39);ctx.fillStyle='#02080e';ctx.fill();
  const metal=ctx.createLinearGradient(-30,-34,32,34);
  [[0,'#92b7be'],[.2,'#344d5c'],[.5,'#172c3c'],[.8,'#607e88'],[1,'#182d3c']].forEach(([p,c])=>metal.addColorStop(p,c));
  circle(ctx,0,0,34);ctx.fillStyle=metal;ctx.fill();
  circle(ctx,0,0,29);ctx.fillStyle='#020b12';ctx.fill();ctx.strokeStyle=hot;ctx.lineWidth=1;ctx.stroke();
  circle(ctx,0,0,25);ctx.fillStyle=poisoned?'#183419':'#352418';ctx.fill();
  // A stylized bundle cross section: luminous pins inside the collision boundary.
  for(const [count,radius] of [[1,0],[6,9],[12,18]]) for(let i=0;i<count;i++) {
    const a=i*TAU/count,x=Math.cos(a)*radius,y=Math.sin(a)*radius;
    circle(ctx,x,y,3.8);ctx.fillStyle=hot;ctx.fill();
    circle(ctx,x-1,y-1,1.4);ctx.fillStyle=poisoned?'#efffd5':'#fff3c9';ctx.fill();
  }
  for(let i=0;i<6;i++) {
    const a=i*TAU/6;circle(ctx,Math.cos(a)*31.5,Math.sin(a)*31.5,1.4);ctx.fillStyle='#08131e';ctx.fill();
  }
  fuelSprites.set(poisoned,sprite);return sprite;
}

export function renderChamber(ctx, game, reducedMotion) {
  const t=reducedMotion?0:game.time;
  ctx.drawImage(chamberImage(),0,0,1000,1000);
  ctx.save();circle(ctx,C,C,R-1);ctx.clip();
  // Fixed-size ambient field. Never enters the physics or allocates particles.
  if(!reducedMotion) for(let i=0;i<46;i++) {
    const a=i*2.39996+t*.009,r=80+(i*71%350);
    const x=C+Math.cos(a)*r,y=C+Math.sin(a)*r;
    ctx.fillStyle=`rgba(105,191,221,${.08+.09*(1+Math.sin(t*.7+i))})`;
    circle(ctx,x,y,i%3===0?1.3:.7);ctx.fill();
  }
  for(const fuel of game.fuels) {
    const poison=game.poisonedFuelIds.includes(fuel.id);
    ctx.drawImage(fuelImage(poison),fuel.x-64,fuel.y-64,128,128);
    if(poison) {
      const pulse=.65+Math.sin(t*2+fuel.id)*.15;
      ctx.strokeStyle=`rgba(157,255,89,${pulse})`;ctx.lineWidth=2;
      circle(ctx,fuel.x,fuel.y,fuel.radius+5);ctx.stroke();
      ctx.save();ctx.translate(fuel.x,fuel.y);ctx.rotate(t*.12);
      ctx.setLineDash([9,7]);circle(ctx,0,0,fuel.radius+12);ctx.stroke();ctx.restore();
      ctx.fillStyle='#dbffbd';ctx.font='bold 15px monospace';ctx.textAlign='center';ctx.fillText('×',fuel.x,fuel.y+5);
    }
  }
  for(const atom of game.atoms) {
    const flash=Math.min(1,atom.flash/.35),a=atom.phase+t*.45;
    ctx.save();ctx.translate(atom.x,atom.y);
    halo(ctx,0,0,22,'#2eb8db',.24+flash*.5);
    ctx.strokeStyle=`rgba(107,221,239,${.5+flash*.4})`;ctx.lineWidth=1;
    ctx.beginPath();ctx.ellipse(0,0,12,5,a,0,TAU);ctx.stroke();
    for(const side of [-1,1]) {
      const x=Math.cos(a)*3.3*side,y=Math.sin(a)*3.3*side;
      circle(ctx,x,y,4.2);ctx.fillStyle=side===1?'#79dff4':'#357895';ctx.fill();
      circle(ctx,x-1,y-1,1.4);ctx.fillStyle='#d9faff';ctx.fill();
    }
    if(flash>0) {circle(ctx,0,0,12+(1-flash)*20);ctx.globalAlpha=flash;ctx.strokeStyle='#bffffa';ctx.stroke();}
    ctx.restore();
  }
  for(const rod of game.rods) {
    // Exactly the same tip and bounds as the engine; glow is not a hitbox.
    const top=C-340+(Math.sin(game.time*.72+rod.phase)+1)/2*260;
    const x=rod.x-rod.width,w=rod.width*2;
    ctx.fillStyle='rgba(239,81,182,.07)';ctx.fillRect(x,55,w,890);
    const metal=ctx.createLinearGradient(x,0,x+w,0);
    metal.addColorStop(0,'#591b51');metal.addColorStop(.45,'#f096c9');metal.addColorStop(.6,'#6f285e');metal.addColorStop(1,'#301432');
    ctx.fillStyle=metal;ctx.fillRect(x,top,w,rod.height);
    ctx.strokeStyle='#ff79c6';ctx.lineWidth=2;ctx.strokeRect(x,top,w,rod.height);
    ctx.fillStyle='#2d1333';for(let y=top+8;y<top+rod.height-6;y+=12)ctx.fillRect(x+3,y,Math.max(1,w-6),3);
    halo(ctx,rod.x,top+rod.height,24,'#ef5fb4',.6);
  }
  if(game.burst) {
    const b=game.burst;
    ctx.save();ctx.translate(b.x,b.y);ctx.globalAlpha=Math.min(1,b.life);
    halo(ctx,0,0,48,'#46d8ff',.8);ctx.rotate(t*.65);
    ctx.strokeStyle='#9dedff';ctx.lineWidth=1.5;
    for(let i=0;i<3;i++){ctx.rotate(TAU/3);ctx.beginPath();ctx.ellipse(0,0,27,9,0,0,TAU);ctx.stroke();}
    circle(ctx,0,0,6);ctx.fillStyle='#f2ffff';ctx.fill();ctx.restore();
  }
  for(const effect of game.effects) {
    const p=Math.min(1,1-effect.life/effect.maxLife),big=effect.type==='fission';
    ctx.save();ctx.globalAlpha=(1-p)*(reducedMotion?.35:1);
    ctx.strokeStyle=effect.color;ctx.lineWidth=big?3:1.5;
    circle(ctx,effect.x,effect.y,10+p*(big?150:30));ctx.stroke();
    if(big&&!reducedMotion) {
      halo(ctx,effect.x,effect.y,30+p*170,'#ffb673',.8*(1-p));
      circle(ctx,effect.x,effect.y,6+p*105);ctx.lineWidth=1;ctx.stroke();
      for(let i=0;i<24;i++) {
        const a=i*2.39996,d=15+p*(65+i%5*23);
        ctx.beginPath();ctx.moveTo(effect.x+Math.cos(a)*d,effect.y+Math.sin(a)*d);
        ctx.lineTo(effect.x+Math.cos(a)*(d+8+14*(1-p)),effect.y+Math.sin(a)*(d+8+14*(1-p)));ctx.stroke();
      }
    }
    ctx.restore();
  }
  ctx.restore();
  const n=game.neutron,d=Math.hypot(n.x-C,n.y-C);
  if(game.phase===GamePhase.PLAYING&&d>R-85) {
    const a=Math.atan2(n.y-C,n.x-C);
    ctx.save();ctx.strokeStyle=`rgba(255,116,90,${Math.min(.9,(d-(R-85))/85)})`;ctx.lineWidth=5;
    ctx.beginPath();ctx.arc(C,C,R,a-.18,a+.18);ctx.stroke();ctx.restore();
  }
}

export function renderNeutron(ctx,n,reducedMotion) {
  const color=colors[n.band];ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
  if(!reducedMotion) for(let i=1;i<n.trail.length;i++) {
    const p=n.trail[i],q=n.trail[i-1],fade=i/n.trail.length;
    ctx.strokeStyle=color;ctx.globalAlpha=fade*p.life*.25;ctx.lineWidth=3+fade*11;
    ctx.beginPath();ctx.moveTo(q.x,q.y);ctx.lineTo(p.x,p.y);ctx.stroke();
    ctx.globalAlpha=fade*p.life*.8;ctx.lineWidth=.6+fade*3;ctx.stroke();
  }
  ctx.globalAlpha=1;halo(ctx,n.x,n.y,40,color,.65);
  circle(ctx,n.x,n.y,CONFIG.neutronRadius+5);ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.stroke();
  circle(ctx,n.x,n.y,CONFIG.neutronRadius);ctx.fillStyle=color;ctx.fill();
  circle(ctx,n.x-1,n.y-1,CONFIG.neutronRadius*.62);ctx.fillStyle='#f3ffff';ctx.fill();
  ctx.restore();
}
