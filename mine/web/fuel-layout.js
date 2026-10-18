// Shared metre dimensions for the industrial diesel depot and its general-plan symbols.
export const FUEL_LAYOUT={
 base:{x0:-125,x1:70,z0:-50,z1:50},floor:.16,
 tanks:{x:-22,z:[-12,12],radius:1.25,barrel:6,head:.6,centreY:2.1,nominalM3:30},
 bund:{w:14,d:6,wallTop:1.41,wall:.22},
 canopy:{x:14,z:5,w:44,d:30,clearY:10.2,posts:[[-6,-8],[-6,18],[34,-8],[34,18]]},
 island:{x:14,z:0,w:28,d:2.4,top:.36},
 dispensers:[{x:6,z:0},{x:22,z:0}],
 heavy:{x:6,z:10.4,yaw:Math.PI},light:{x:22,z:-5.5,yaw:0},
 tanker:{dockX:-44,waitX:-108,z:0},
 pump:{x:-6,z:0,w:7,d:5,h:4.2},operator:{x:50,z:-19,w:8,d:6,h:3.6},
 lubricants:{x:50,z:-34,w:12,d:8,h:5},receiving:{x:-35.6,z:4.5},
};
