#pragma once
#include <cmath>
#include <cstddef>
#include <cstdint>

namespace owy {
// All cues: 80 ms mono PCM16 / 16 kHz, even fitting the previous 100 ms ring.
// A shared fixed buffer is filled only when the exclusive sound owner is idle.
constexpr size_t CUE_SAMPLES=1280, CUE_BYTES=CUE_SAMPLES*2;
inline void make_cue(uint8_t *pcm, int kind) {
  constexpr float pi=3.14159265359f;
  for (size_t i=0; i<CUE_SAMPLES; ++i) {
    const float t=float(i)/16000.f, u=float(i)/(CUE_SAMPLES-1);
    // Rounded attack, long soft release; harmonic bell with a gentle upward inflection.
    const float envelope=std::pow(std::sin(pi*u),2.f)*(1.f-.35f*u);
    const float base=kind==1 ? 740.f : kind==2 ? 1000.f : 554.365f;
    const float phase=2*pi*(base*t+(kind==2 ? 0.f : 160.f*t*t));
    const float wave=kind==2 ? std::sin(phase) :
        .78f*std::sin(phase)+.17f*std::sin(phase*1.5f)+.05f*std::sin(phase*2.f);
    const int16_t sample=(i==0 || i==CUE_SAMPLES-1) ? 0 : int16_t(2600.f*envelope*wave);
    const auto bits=uint16_t(sample);
    pcm[i*2]=uint8_t(bits); pcm[i*2+1]=uint8_t(bits>>8);
  }
}
}  // namespace owy
