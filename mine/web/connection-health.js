// Connection health follows source heartbeats, including when model time is paused.
export class ConnectionHealth {
  constructor(now){this.started=now;this.lastByte=now;this.lastMine=null;this.source=null;}
  byte(now){this.lastByte=now;}
  mine(now,unix){this.lastMine=now;this.source=Number.isFinite(unix)?unix*1000:null;}
  status(now){
    if(now-this.lastByte>45000)return {online:false,reconnect:true,text:'нет потока — повтор'};
    if(this.lastMine===null)return {online:false,reconnect:now-this.started>30000,text:'ожидание данных Ditto…'};
    const lag=Math.max(now-this.lastMine,this.source===null?0:now-this.source);
    if(lag>30000)return {online:false,reconnect:true,text:'данные задержаны — повтор'};
    return {online:true,reconnect:false,text:lag>5000?'поток Ditto · задержка '+Math.round(lag/1000)+' с':'поток Ditto'};
  }
}
export class EventFrames {
  constructor(){this.buffer='';}
  push(text){
    this.buffer=(this.buffer+text).replace(/\r\n/g,'\n');
    const events=[];let index;
    while((index=this.buffer.indexOf('\n\n'))>=0){
      const chunk=this.buffer.slice(0,index);this.buffer=this.buffer.slice(index+2);
      const data=chunk.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');
      if(data){try{events.push(JSON.parse(data));}catch{}}
    }
    if(this.buffer.length>4*1024*1024)throw new Error('oversize event');
    return events;
  }
}
export const reconnectDelay=attempt=>Math.min(30000,2000*2**Math.min(attempt,4));
