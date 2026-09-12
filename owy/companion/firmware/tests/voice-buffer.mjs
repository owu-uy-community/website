// Real vendored receive method, with speaker startup deliberately unacknowledged.
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const src = readFileSync(new URL("../components/voice_assistant/voice_assistant.cpp", import.meta.url), "utf8");
const capacity = src.match(/static const size_t SPEAKER_BUFFER_SIZE = (\d+) \* RECEIVE_SIZE;/)?.[1];
assert.equal(capacity, "32");
assert(src.includes("speaker_allocator(RAMAllocator<uint8_t>::ALLOC_EXTERNAL)"), "No internal-SRAM fallback for enlarged receive buffer");
const begin = src.indexOf("void VoiceAssistant::on_audio(");
const end = src.indexOf("void VoiceAssistant::on_timer_event(", begin);
assert(begin > 0 && end > begin);
const body = src.slice(begin, end);
function source(kib) {
  return `
#include <cassert>
#include <cstdint>
#include <cstring>
#include <vector>
#include <iostream>
#define USE_SPEAKER
int rejected=0;
#define ESP_LOGE(...) (++rejected)
#define ESP_LOGV(...) ((void)0)
constexpr size_t SPEAKER_BUFFER_SIZE=${kib}*1024;
namespace api { struct VoiceAssistantAudio { const uint8_t *data; size_t data_len; }; }
class VoiceAssistant {
 public:
  int marker=1;
  int *speaker_=&marker;
  std::vector<uint8_t> memory=std::vector<uint8_t>(SPEAKER_BUFFER_SIZE,0);
  uint8_t *speaker_buffer_=memory.data();
  size_t speaker_buffer_index_=0, speaker_buffer_size_=0, speaker_bytes_received_=0;
  bool running=false;
  std::vector<uint8_t> played;
  void write_speaker_() {
    if(!running) return;
    played.insert(played.end(),speaker_buffer_,speaker_buffer_+speaker_buffer_size_);
    speaker_buffer_index_=speaker_buffer_size_=0;
  }
  void on_audio(const api::VoiceAssistantAudio &msg);
};
${body}
int main() {
  VoiceAssistant v;
  std::vector<uint8_t> expected;
  for(int frame=0;frame<22;++frame) {
    std::vector<uint8_t> pcm(1024,uint8_t(frame));
    expected.insert(expected.end(),pcm.begin(),pcm.end());
    v.on_audio({pcm.data(),pcm.size()});
  }
  assert(rejected==0); // upstream 16 KiB must fail here
  assert(v.speaker_bytes_received_==22528 && v.speaker_buffer_size_==22528);
  v.running=true; v.write_speaker_();
  assert(v.played==expected && v.speaker_buffer_index_==0);
  VoiceAssistant boundary;
  std::vector<uint8_t> full(SPEAKER_BUFFER_SIZE,42);
  boundary.on_audio({full.data(),full.size()});
  assert(boundary.speaker_buffer_size_==SPEAKER_BUFFER_SIZE && rejected==0);
  const uint8_t extra[2]={8,9}; boundary.on_audio({extra,2});
  assert(rejected==1 && boundary.speaker_buffer_size_==SPEAKER_BUFFER_SIZE);
  boundary.running=true; boundary.write_speaker_(); assert(boundary.played==full);
  boundary.on_audio({extra,2}); assert(boundary.played.size()==SPEAKER_BUFFER_SIZE+2);
  std::cout << "receive retention, ordered drain and exact-capacity rejection passed\\n";
}
`;
}
const dir = mkdtempSync(join(tmpdir(), "owy-voice-buffer-"));
try {
  for (const kib of [Number(capacity), 16]) {
    const bin = join(dir, `check-${kib}`);
    const compiled = spawnSync("c++", ["-std=c++17", "-Wall", "-Wextra", "-Werror", "-fsanitize=address,undefined", "-x", "c++", "-", "-o", bin], { input: source(kib), encoding: "utf8" });
    assert.equal(compiled.status, 0, compiled.stderr);
    const run = spawnSync(bin, [], { encoding: "utf8" });
    if (kib === 32) assert.equal(run.status, 0, run.stderr || run.stdout);
    else assert.notEqual(run.status, 0, "Upstream negative control did not reproduce burst loss");
  }
  console.log("PASS actual voice receiver: 22,528B delayed-start burst retained; ordered drain, bounded overflow; upstream 16KiB negative control reproduced");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
