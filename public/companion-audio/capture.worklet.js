import {CapturePCM} from './pcm.mjs';
class OwyCapture extends AudioWorkletProcessor {
  constructor(){super();this.converter=new CapturePCM(sampleRate);}
  process(inputs){
    const mono=inputs[0]?.[0];
    if(mono)this.converter.push(mono,bytes=>this.port.postMessage(bytes,[bytes]));
    return true;
  }
}
registerProcessor('owy-capture',OwyCapture);
