# Pinned ESPHome audio fixes

Source: ESPHome 2026.8.2, copied from the installed package. All files under
`i2s_audio/` are upstream except the five-line startup guard in
`speaker/i2s_audio_speaker.cpp`. See `LICENSE.esphome`.

Upstream: https://github.com/esphome/esphome/tree/2026.8.2/esphome/components/i2s_audio

The main loop stays in STATE_STARTING until the speaker task posts TASK_RUNNING.
If initialization takes multiple iterations, upstream calls start_i2s_driver()
again even though the task exists and the driver already holds the bus. That
second lock attempt produces "Parent bus is busy" without any microphone owner.
The guard waits for task state events instead. Normal stop/failure event handling
still runs before it, and allocation failures still retry with a null task handle.

This was reproduced on the 1.75C after a silent follow-up and a new listening cue.
The hardware regression exercises that exact sequence. Keep this dependency at
2026.8.2 and re-audit/remove the override once an upstream version includes the fix.
No Homebrew or system package files are modified.

Run `pnpm companion:driver-test` from `owy/` for a host C++ test of the actual
loop body with delayed task events. Its negative control removes only the
guard and must reproduce the double lock; stop/restart and failure retries
must continue working with the fix.

## Bounded voice receive buffer

`voice_assistant/` is also copied unchanged from installed ESPHome 2026.8.2,
except `SPEAKER_BUFFER_SIZE` is 32 KiB instead of 16 KiB, allocated explicitly
in PSRAM (never falling back to precious internal SRAM). The existing license
applies. Upstream: https://github.com/esphome/esphome/tree/2026.8.2/esphome/components/voice_assistant

A 700 ms transport pause followed by a 22,528 B TCP batch reproduced dropped
audio in the 16 KiB receive buffer while the speaker task restarted. Increasing
the driver ring alone to 250 ms still failed intermittently; it cannot protect
data arriving before the task acknowledges startup. The receiver needs capacity
independent of that asynchronous task. The driver ring remains 100 ms, the
bridge still paces 100 ms ahead, and the bus-release timeout is unchanged.

This adds 16 KiB of PSRAM capacity without intentionally delaying playback.
It is bounded protection, not a guarantee against arbitrary network stalls or
inaudible gaps. `tests/voice-buffer.mjs` extracts the actual `on_audio` body,
checks byte retention/drain and overflow boundaries, and reproduces the old
failure by changing only capacity back to 16 KiB. Physical regression additionally
injects the pause after pacing. Re-audit both overrides on every ESPHome upgrade.
