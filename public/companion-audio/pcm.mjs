// Streaming area resampler: preserves fractional phase across worklet blocks.
// Box integration provides a small low-pass before reducing to 16 kHz.
export class CapturePCM {
  constructor(rate, target=16000, frameSize=320) {
    if(!Number.isFinite(rate)||rate<target||rate>192000)throw Error('Unsupported audio sample rate');
    this.ratio=rate/target;this.remaining=this.ratio;this.sum=0;
    this.frame=new Int16Array(frameSize);this.index=0;
  }
  push(samples, emit) {
    for(const raw of samples){
      const value=Number.isFinite(raw)?Math.max(-1,Math.min(1,raw)):0;
      let left=1;
      while(left>1e-9){
        const take=Math.min(left,this.remaining);this.sum+=value*take;left-=take;this.remaining-=take;
        if(this.remaining<1e-9){
          const v=this.sum/this.ratio;
          this.frame[this.index++]=Math.round(v*(v<0?32768:32767));this.sum=0;this.remaining=this.ratio;
          if(this.index===this.frame.length){
            const bytes=new ArrayBuffer(this.frame.length*2),view=new DataView(bytes);
            for(let i=0;i<this.frame.length;i++)view.setInt16(i*2,this.frame[i],true);
            emit(bytes);this.index=0;
          }
        }
      }
    }
  }
}
export function pcmLevel(bytes) {
  const view=new DataView(bytes);let total=0;
  for(let i=0;i+1<view.byteLength;i+=2){const v=view.getInt16(i,true)/32768;total+=v*v;}
  return Math.sqrt(total/Math.max(1,view.byteLength/2));
}
