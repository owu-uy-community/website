// Deterministically exercise the actual vendored loop() with delayed RTOS
// startup notifications. No ESP32 or Gemini required; needs a host C++ compiler.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const source = readFileSync(new URL("../components/i2s_audio/speaker/i2s_audio_speaker.cpp", import.meta.url), "utf8");
const start = source.indexOf("void I2SAudioSpeakerBase::loop()");
const end = source.indexOf("void I2SAudioSpeakerBase::set_volume", start);
assert(start >= 0 && end > start, "Could not locate actual driver loop");
const loop = source.slice(start, end);
const prelude = `
#include <cassert>
#include <cstdint>
#include <cstddef>
#define ESP_LOGD(...) ((void)0)
#define ESP_LOGV(...) ((void)0)
#define ESP_LOGE(...) ((void)0)
constexpr int ESP_OK=0, TASK_STACK_SIZE=4096, TASK_PRIORITY=19;
namespace speaker { enum State { STATE_STOPPED, STATE_STARTING, STATE_RUNNING, STATE_STOPPING }; }
namespace SpeakerEventGroupBits {
enum { COMMAND_START=1, TASK_STARTING=2, TASK_RUNNING=4, TASK_STOPPING=8,
  TASK_STOPPED=16, ERR_ESP_NO_MEM=32, ERR_DROPPED_EVENT=64,
  ERR_PARTIAL_WRITE=128, ERR_LOCKSTEP_DESYNC=256, ALL_BITS=511 };
}
uint32_t bits=0;
uint32_t xEventGroupGetBits(int) { return bits; }
void xEventGroupClearBits(int, uint32_t clear) { bits &= ~clear; }
void vTaskDelete(void*) {}
void xTaskCreate(void(*)(void*), const char*, int, void*, int, void** handle) { *handle = reinterpret_cast<void*>(1); }
class I2SAudioSpeakerBase {
public:
  speaker::State state_=speaker::STATE_STARTING;
  void* speaker_task_handle_=nullptr;
  int event_group_=0, audio_stream_info_=0, starts=0, stops=0, errors=0;
  bool locked=false, error=false, fail_start=false;
  void loop();
  static void speaker_task(void*) {}
  bool status_has_error() { return error; }
  void status_clear_error() { error=false; }
  void status_momentary_error(const char*, int) { error=true; ++errors; }
  int start_i2s_driver(int&) { ++starts; if (locked || fail_start) return 1; locked=true; return 0; }
  void stop_i2s_driver_() { locked=false; ++stops; }
  void on_task_stopped() {}
};
`;
const checks = `
int main() {
  I2SAudioSpeakerBase driver;
  driver.loop(); // Driver owns the mutex, RTOS task has not acknowledged yet.
  for (int i=0; i<10; ++i) driver.loop();
  if (driver.starts != 1 || driver.errors != 0) return 10;
  bits=SpeakerEventGroupBits::TASK_STARTING; driver.loop();
  if (driver.starts != 1) return 11;
  bits=SpeakerEventGroupBits::TASK_RUNNING; driver.loop();
  if (driver.state_ != speaker::STATE_RUNNING) return 12;
  bits=SpeakerEventGroupBits::TASK_STOPPED; driver.loop();
  if (driver.state_ != speaker::STATE_STOPPED || driver.locked || driver.speaker_task_handle_) return 13;
  driver.state_=speaker::STATE_STARTING; driver.loop();
  if (driver.starts != 2 || driver.errors) return 14;
  bits=SpeakerEventGroupBits::TASK_STOPPED; driver.loop();
  driver.state_=speaker::STATE_STARTING; driver.fail_start=true; driver.loop();
  if (driver.errors != 1 || driver.speaker_task_handle_) return 15;
  driver.error=false; driver.fail_start=false; driver.loop();
  if (driver.starts != 4 || !driver.speaker_task_handle_) return 16;
  return 0;
}
`;
const dir = mkdtempSync(join(tmpdir(), "owy-speaker-startup-"));
try {
  function check(body, name) {
    const executable = join(dir, name);
    const build = spawnSync("c++", ["-std=c++17", "-x", "c++", "-", "-o", executable], {
      input: prelude + body + checks, encoding: "utf8",
    });
    assert.equal(build.status, 0, build.stderr || String(build.error));
    return spawnSync(executable).status;
  }
  assert.equal(check(loop, "fixed"), 0, "Patched driver failed delayed-start/stop/retry checks");
  // Negative control: removing ONLY our guard must reproduce the double lock.
  const upstream = loop.replace(/      if \(this->speaker_task_handle_ != nullptr\) \{\n        break;\n      \}\n/, "");
  assert.notEqual(upstream, loop);
  assert.equal(check(upstream, "upstream"), 10, "Original driver no longer reproduces; re-audit the override");
  console.log("PASS actual speaker loop: delayed startup, stop/restart, failed-start retry; upstream negative control reproduced");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
