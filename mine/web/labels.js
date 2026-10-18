// Shared screen-space placement. Smart mode keeps equipment readable; full mode adds detail.
export function layoutSceneLabels(scene, w, h) {
  if (!w || !h) return;
  const now=performance.now();
  if(now-(scene._labelTime || 0)<60) return;
  scene._labelTime=now;
  const bounds = scene.host.getBoundingClientRect();
  const parent = scene.host.parentElement;
  const obstacles = [...parent.querySelectorAll('.toolbar, .legend, .hint-bar, .scene-label-obstacle')].filter(e => e.offsetWidth && e.offsetHeight).map(e => {
    const r=e.getBoundingClientRect(); return [r.left-bounds.left-5,r.top-bounds.top-5,r.right-bounds.left+5,r.bottom-bounds.top+5];
  });
  const top = Math.max(12, ...obstacles.filter(r => r[1]<20).map(r=>r[3]+8));
  const bottom = Math.min(h-12, ...obstacles.filter(r=>r[1]>h/2).map(r=>r[1]-8));
  const items=[]; scene._labelFrame=(scene._labelFrame || 0)+1;
  for (const [id,l] of Object.entries(scene.labels)) {
    if(l.hidden) {l.el.style.display='none';continue;}
    const p=l.pos.clone().project(scene.camera);
    if(p.z < -1 || p.z > 1 || Math.abs(p.x)>1 || Math.abs(p.y)>1) {l.el.style.display='none';continue;}
    const selected=id===scene.picked, hovered=id===scene.hl?.hov;
    const alarm=l.el.classList.contains('alarm'), warn=l.el.classList.contains('warn');
    const mobile=/^(p-\d+|truck-)/.test(id);
    if(!scene.showAllLabels && mobile && !selected && !hovered && !alarm) {l.el.style.display='none';continue;}
    const pr=selected?0:hovered?1:alarm?2:warn?3:mobile?6:scene.labelPriority?.includes(id)?4:5;
    items.push({id,l,pr,x:(p.x+1)*w/2,y:(1-p.y)*h/2,depth:p.z});
  }
  items.sort((a,b)=>a.pr-b.pr || a.depth-b.depth || a.id.localeCompare(b.id));
  const placed=[...obstacles]; let ordinary=0;
  const intersects=(a,b)=>a[0]<b[2] && a[2]>b[0] && a[1]<b[3] && a[3]>b[1];
  for(const it of items) {
    const {l,pr}=it;
    if(!scene.showAllLabels && pr>=4 && ordinary>=3) {l.el.style.display='none';continue;}
    l.el.style.display=''; l.el.classList.toggle('sel',it.id===scene.picked);
    if(!l.bw || scene._labelFrame%30===0){l.bw=l.el.offsetWidth || 100;l.bh=l.el.offsetHeight || 22;}
    const bw=Math.min(l.bw,w-24), bh=l.bh;
    const x=Math.max(bw/2+12,Math.min(w-bw/2-12,it.x));
    const base=Math.max(top+1.2*bh,Math.min(bottom+0.2*bh,it.y));
    let rect, y;
    for(const k of [0,-1,1,-2,2,-3,3]) {
      y=base+k*(bh+6); rect=[x-bw/2-4,y-1.2*bh-3,x+bw/2+4,y-0.2*bh+3];
      if(rect[1]<top || rect[3]>bottom || placed.some(r=>intersects(rect,r))) {rect=null;continue;}
      break;
    }
    if(!rect) {l.el.style.display='none';continue;}
    placed.push(rect); if(pr>=4) ordinary++;
    l.el.style.left=`${x}px`; l.el.style.top=`${y}px`;
  }
}
