import {CapturePCM,pickChannel} from './pcm.mjs';
class OwyCapture extends AudioWorkletProcessor {
  constructor(){
    super();this.converter=new CapturePCM(sampleRate);this.pick='L';this.scratch=new Float32Array(128);
    // The talk console picks a side of a stereo wireless kit (L = presenter, R = audience) live.
    this.port.onmessage=({data})=>{if(data&&['L','R','mix'].includes(data.channel))this.pick=data.channel;};
  }
  process(inputs){
    const channels=inputs[0];
    if(channels?.length){
      if(this.scratch.length!==channels[0].length)this.scratch=new Float32Array(channels[0].length);
      this.converter.push(pickChannel(channels,this.pick,this.scratch),bytes=>this.port.postMessage(bytes,[bytes]));
    }
    return true;
  }
}
registerProcessor('owy-capture',OwyCapture);
