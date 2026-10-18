import * as THREE from 'three';
import {EQUIPMENT} from './equipment-catalog.js';
export function bindEquipment(hl){
 const site=hl.site;if(!site)return;
 hl.scene.updateMatrixWorld(true);
 for(const spec of EQUIPMENT){
  if(spec.site!==site||!spec.pose||!spec.size)continue;
  const source=hl.items.get(spec.parent);if(!source)continue;
  const [x,y,z]=spec.pose,[w,h,d]=spec.size,meshes=new Set();
  for(const root of source.roots)root.traverse(mesh=>{if(!mesh.isMesh||mesh.userData.twin!==spec.parent)return;const g=mesh.geometry;if(!g?.attributes?.position)return;g.computeBoundingBox();const bb=g.boundingBox.clone().applyMatrix4(mesh.matrixWorld),c=bb.getCenter(new THREE.Vector3()),size=bb.getSize(new THREE.Vector3());if(Math.abs(c.x-x)<=w/2+.15&&Math.abs(c.z-z)<=d/2+.15&&c.y>=y-.1&&c.y<=y+h+.15&&size.x<=w*1.7&&size.z<=d*1.7&&size.y<=h*1.7)meshes.add(mesh);});
  if(!meshes.size)continue;
  const roots=[];for(const mesh of meshes){mesh.userData.twin=spec.twin;roots.push(mesh);}
  const existing=hl.items.get(spec.twin)?.roots||[];hl.items.set(spec.twin,{roots:[...new Set([...existing,...roots])],halo:null,pad:.1,ground:false});
 }
}
