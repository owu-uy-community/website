import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { entityId } from "esphome-client";
import { PacedSpeaker } from "../audio/pcm";
import { loadConfig } from "../config";
import { CompanionDevice } from "../device/esphome";
import { VoiceTurn } from "../device/pipeline";
import { createLogger } from "../log";

/** Real hardware regression. Stop companion:dev first: this owns the voice
 * subscription. Uses local PCM tones, no Gemini, no event/site mutations. */
async function main() {
  const spec = loadConfig().devices[0];
  assert(spec, "Set COMPANION_DEVICES");
  const log = createLogger("audio-check", "info");
  let device!: CompanionDevice;
  let turn: VoiceTurn | null = null;
  let pacer: PacedSpeaker | null = null;
  let transportTimer: ReturnType<typeof setTimeout> | null = null;
  let heldFrames: Buffer[] = [];
  const stopOutput = () => {
    if (transportTimer) clearTimeout(transportTimer);
    transportTimer = null; heldFrames = [];
    pacer?.stop(); turn?.finish();
  };
  let requests = 0;
  let stops = 0;
  let micBytes = 0;
  let playbackCompletions = 0;
  let chimes = 0;
  let feedbackCues = 0;
  let feedbackAccepted = 0;
  let lastFrameAt = 0, maxFrameGap = 0;
  let followUpReplies = 0;
  let idleGuards = 0;
  let mode: "reply" | "silence" | "hung" | "follow-up" | "cancel-listening" | "cancel-speaking" | "decline" = "reply";
  let durationMs = 600;
  const failures: string[] = [];
  const wakeId = entityId("switch", "wake_word");
  const continuousId = entityId("switch", "continuous_conversation");
  const chimeId = entityId("switch", "listening_chime");
  const quietId = entityId("switch", "quiet_mode");
  const privacyId = entityId("switch", "microphone_privacy");
  const motionId = entityId("switch", "motion_face");
  const reducedId = entityId("switch", "reduced_motion");
  const effectsId = entityId("switch", "interaction_sounds");
  const feedbackId = entityId("button", "companion_sound");
  const stateId = entityId("text_sensor", "audio_state");
  const talkId = entityId("button", "hablar");
  const state = () => device.client.latest(stateId)?.state;
  // The protobuf decoder omits false/default scalar fields; an existing
  // switch state with no `state` member means OFF, not missing telemetry.
  const switchState = (id: typeof wakeId): boolean | undefined => {
    const value = device.client.latest(id);
    return value ? value.state === true : undefined;
  };
  const waitFor = async (label: string, condition: () => boolean, timeoutMs = 8000) => {
    const until = Date.now() + timeoutMs;
    while (!condition()) {
      if (failures.length) throw new Error(failures.join("\n"));
      if (Date.now() >= until) throw new Error(`${label}: timeout (audio=${state()}, turn=${turn?.phase})`);
      await sleep(50);
    }
  };
  const connect = async () => {
    device = await CompanionDevice.connect(spec, {
      onRequestStart: () => {
        requests++;
        micBytes = 0;
        if (mode === "decline") return device.declineRequest();
        device.acceptRequest();
        const current = new VoiceTurn({
          link: device, logger: log, conversationId: "audio-regression",
          timers: { noSpeechMs: mode === "hung" ? 0 : mode === "silence" ? 700 : mode === "follow-up" ? 8000 : 4000 },
          onPhase: p => { if (p === "finished") pacer?.stop(); },
          onNoSpeech: () => log.info(`Silent window completed; ${micBytes} microphone bytes received`),
        });
        turn = current;
        current.start();
        if (mode === "silence" || mode === "hung" || mode === "cancel-listening" || (mode === "follow-up" && followUpReplies-- <= 0)) return;
        current.markSpeechStarted();
        void sleep(450).then(() => {
          if (turn !== current || current.finished) return;
          current.endListening("Prueba de audio");
          current.beginSpeaking("Prueba de audio");
          lastFrameAt = maxFrameGap = 0;
          let injectedStall = false;
          const transportStallMs = Number(process.env.COMPANION_CHECK_TRANSPORT_STALL_MS ?? 0);
          pacer = new PacedSpeaker(frame => {
            const now = performance.now();
            const gap = lastFrameAt ? now - lastFrameAt : 0;
            maxFrameGap = Math.max(maxFrameGap, gap);
            if (gap > 150) log.warn(`host audio send gap: ${Math.round(gap)}ms`);
            lastFrameAt = now;
            if (transportTimer) { heldFrames.push(frame); return; }
            if (!injectedStall && transportStallMs > 0 && current.audioBytesSent >= 32000) {
              injectedStall = true;
              heldFrames.push(frame);
              log.info(`injecting ${transportStallMs}ms transport stall after pacing`);
              transportTimer = setTimeout(() => {
                transportTimer = null;
                const buffered = heldFrames; heldFrames = [];
                if (turn === current && !current.finished) {
                  log.info(`releasing transport burst: ${buffered.reduce((n, f) => n + f.length, 0)}B`);
                  for (const held of buffered) current.pushAudio(held);
                }
              }, Math.min(2000, transportStallMs));
            } else current.pushAudio(frame);
          }, {
            bytesPerSecond: 32000, leadMs: 100, isReady: () => current.phase === "speaking",
          });
          const pcm = tone(durationMs);
          for (let i = 0; i < pcm.length; i += 1024) pacer.push(pcm.subarray(i, i + 1024));
          pacer.finish(() => current.endSpeaking());
        });
      },
      onRequestStop: () => {
        stops++;
        stopOutput();
      },
      onAudio: chunk => { micBytes += chunk.data.length; },
    }, log, { retryForMs: 5000 });
    // ESPHome uses CONFIG=4, DEBUG=5; esphome-client 2.0's DEBUG constant is 4.
    device.client.subscribeToLogs(5);
    device.client.on("log", event => {
      if (process.env.COMPANION_LOG_LEVEL === "debug") log.info(`device: ${JSON.stringify(event)}`);
      if (/Parent bus is busy|Driver failed to start|Cannot receive audio|recovery timed out|mic-channel-stalled/i.test(event.message)) {
        failures.push(event.message);
      }
      if (event.message.includes("Playback complete;")) playbackCompletions++;
      if (event.message.includes("Listening chime queued: ok")) chimes++;
      if (event.message.includes("Listening chime queued: failed")) failures.push(event.message);
      if (event.message.includes("Interaction cue queued: failed")) failures.push(event.message);
      if (event.message.includes("Interaction cue queued: ok")) feedbackCues++;
      if (event.message.includes("Interaction cue accepted")) feedbackAccepted++;
      if (event.message.includes("Idle listening guard:")) idleGuards++;
      if (/Wake word re-armed|Playback complete;/.test(event.message)) log.info(event.message);
    });
  };

  await connect();
  // Match the real bridge's visual-envelope cadence during every paced reply.
  let animationTick = 0;
  const visualEnvelope = setInterval(() => {
    if (state() === "speaking") device.setSpeakLevel([.25, .5, 1, .75][animationTick++ % 4]!);
    else device.setSpeakLevel(0);
  }, 300);
  const metrics = setInterval(() => {
    const sample = Object.fromEntries([
      "motion_poll_rate", "motion_maximum_gap", "animation_tick_rate",
      "internal_free_memory", "internal_largest_block",
    ].map(name => [name, device.client.latest(entityId("sensor", name))?.state]));
    log.info(`metrics (last published samples): ${JSON.stringify({ audio: state(), ...sample })}`);
  }, 5000);
  let originalWake: boolean | undefined;
  const restoreSwitches = new Map<typeof continuousId, boolean>();
  const verifyLongReply = async () => {
    mode = "reply";
    durationMs = 20000;
    const completed = playbackCompletions, cancelled = stops;
    device.client.command(talkId, {});
    await waitFor("long reply playing", () => state() === "speaking");
    try {
      await waitFor("20-second physical playback completion", () => {
        assert.equal(stops, cancelled, "Long reply cancelled by device input; leave screen/BOOT untouched during this check");
        return playbackCompletions > completed;
      }, 25000);
      await waitFor("20-second reply complete", () => state() === "wake_word", 25000);
      assert.equal(stops, cancelled, "Long reply was cancelled, not completed");
      assert.equal(turn!.audioBytesSent, 640000, "Long reply lost output bytes");
    } finally {
      log.info(`long-reply send timing: maxGap=${Math.round(maxFrameGap)}ms, bytes=${turn?.audioBytesSent}`);
    }
    log.info("PASS 20-second paced reply without receive-buffer overflow");
  };
  try {
    assert(device.client.getEntitiesWithIds().some(e => e.id === stateId), "Flash the audio-lifecycle firmware first");
    await waitFor("initial state", () => switchState(wakeId) !== undefined);
    originalWake = switchState(wakeId);
    const hasCompanion = device.client.getEntitiesWithIds().some(e => e.id === privacyId);
    const hasFeedback = device.client.getEntitiesWithIds().some(e => e.id === feedbackId);
    for (const id of [continuousId, chimeId, quietId, ...(hasCompanion ? [privacyId, motionId, reducedId] : []), ...(hasFeedback ? [effectsId] : [])]) {
      await waitFor(`switch ${id}`, () => switchState(id) !== undefined);
      restoreSwitches.set(id, switchState(id)!);
    }
    if (hasCompanion) {
      device.client.command(privacyId, { state: false });
      device.client.command(motionId, { state: true });
      device.client.command(reducedId, { state: false });
      await waitFor("IMU readings", () => device.client.latest(entityId("binary_sensor", "motion_sensor_ready"))?.state === true);
      log.info(`PASS real IMU online; power=${device.client.latest(entityId("text_sensor", "power_status"))?.state}`);
    }
    device.client.command(continuousId, { state: false });
    device.client.command(chimeId, { state: true });
    device.client.command(quietId, { state: false });
    device.client.command(wakeId, { state: true });
    await waitFor("single-turn mode", () => switchState(continuousId) === false);
    await waitFor("initial wake word armed", () => state() === "wake_word");
    log.info(`firmware: ${JSON.stringify(device.client.deviceInfo())}`);
    // Diagnostic isolation, never reported as the full acceptance suite.
    if (process.env.COMPANION_CHECK_LONG_ONLY === "1") {
      for (let i = 0; i < 3; i++) await verifyLongReply();
      return;
    }

    if (hasCompanion) {
      const calibrationId = entityId("text_sensor", "motion_calibration");
      if (device.client.getEntitiesWithIds().some(e => e.id === calibrationId)) {
        const calibration = () => device.client.latest(calibrationId)?.state;
        device.client.command(entityId("button", "calibrate_motion"), {});
        await waitFor("calibration starts", () => calibration() === "settling" || calibration() === "collecting");
        await waitFor("calibration is quiescent, not an audio error", () => state() === "calibrating");
        const before = requests;
        device.client.command(talkId, {});
        await sleep(600);
        assert.equal(requests, before, "Calibration allowed a new voice capture");
        device.client.command(entityId("button", "cancel_motion_calibration"), {});
        await waitFor("calibration cancelled", () => calibration() === "cancelled");
        await waitFor("wake restored after calibration cancel", () => state() === "wake_word");
        log.info("PASS calibration cancel: no capture, previous adjustment retained, wake restored");
        device.client.command(entityId("button", "calibrate_motion"), {});
        await waitFor("calibration succeeds on a stationary device", () => calibration() === "success", 16000);
        await waitFor("wake restored after calibration success", () => state() === "wake_word");
        device.client.command(entityId("button", "back_to_owy"), {});
        log.info("PASS real IMU guided calibration completes and returns to wake word");
      }
      for (const scenario of ["idle", "listening", "speaking"] as const) {
        mode = scenario === "speaking" ? "reply" : "cancel-listening";
        durationMs = 5000;
        const beforeStops = stops;
        if (scenario !== "idle") {
          const beforeRequests = requests;
          device.client.command(talkId, {});
          await waitFor("exclusive voice ownership (stop companion:dev before audio-check)", () => requests > beforeRequests, 2500);
          await waitFor(`privacy before ${scenario}`, () => state() === scenario);
        }
        device.client.command(privacyId, { state: true });
        await waitFor(`privacy stops ${scenario}`, () => state() === "privacy");
        if (scenario !== "idle") await waitFor("privacy cancellation delivered", () => stops > beforeStops);
        await sleep(300); // drain any already-in-flight API audio packets
        const beforeRequests = requests, beforeBytes = micBytes;
        device.client.command(talkId, {});
        device.client.command(wakeId, { state: false });
        device.client.command(wakeId, { state: true });
        await sleep(1400); // also crosses the missed-callback repair interval
        assert.equal(state(), "privacy", "Privacy was bypassed by tap/wake re-arm");
        assert.equal(requests, beforeRequests, "Privacy started another turn");
        assert.equal(micBytes, beforeBytes, "Microphone audio continued in privacy");
        device.client.command(privacyId, { state: false });
        await waitFor("privacy off restores wake", () => state() === "wake_word");
        log.info(`PASS privacy from ${scenario}: capture stops, tap/re-arm blocked, wake restored`);
      }
      log.info(`memory: free=${device.client.latest(entityId("sensor", "internal_free_memory"))?.state}, largest=${device.client.latest(entityId("sensor", "internal_largest_block"))?.state}`);
      const pageId = entityId("text_sensor", "interface_page");
      if (device.client.getEntitiesWithIds().some(e => e.id === pageId)) {
        const staffBefore = device.isStaffMode();
        device.client.command(entityId("button", "quick_controls"), {});
        await waitFor("quick controls page", () => device.client.latest(pageId)?.state === "controls");
        assert.equal(device.isStaffMode(), staffBefore, "Quick controls bypassed staff PIN");
        device.client.command(entityId("button", "back_to_owy"), {});
        await waitFor("return to face", () => device.client.latest(pageId)?.state === "face");
        log.info("PASS settings/home navigation preserves staff permission");
      }
    }
    await waitFor("single-turn mode", () => switchState(continuousId) === false);
    device.client.command(wakeId, { state: true });
    await waitFor("wake word armed", () => state() === "wake_word");

    if (hasFeedback) {
      device.client.command(effectsId, { state: true });
      await waitFor("interaction sounds enabled", () => switchState(effectsId) === true);
      const before = feedbackCues;
      device.client.command(feedbackId, {});
      await waitFor("interaction cue physically drained", () => feedbackCues === before + 1);
      await waitFor("wake after interaction cue", () => state() === "wake_word");
      device.client.command(feedbackId, {});
      await sleep(350);
      assert.equal(feedbackCues, before + 1, "Interaction sound bypassed cooldown");
      log.info("PASS interaction cue drains, re-arms wake, rejects rapid repeats");
      await sleep(4000);
      for (const [id, value, label] of [[effectsId, false, "effects disabled"], [quietId, true, "quiet"], [reducedId, true, "reduced motion"]] as const) {
        device.client.command(id, { state: value });
        await waitFor(label, () => switchState(id) === value);
        const accepted = feedbackAccepted;
        device.client.command(feedbackId, {});
        await sleep(300);
        assert.equal(feedbackAccepted, accepted, `${label} allowed a decorative cue`);
        device.client.command(id, { state: !value });
        await waitFor(`${label} restored`, () => switchState(id) === !value);
      }
      log.info("PASS interaction sound disabled/quiet/reduced preferences");
      const accepted = feedbackAccepted;
      device.client.command(feedbackId, {});
      await waitFor("feedback starts before privacy", () => feedbackAccepted > accepted);
      device.client.command(privacyId, { state: true });
      await waitFor("privacy interrupts feedback", () => state() === "privacy");
      const cancelled = feedbackCues;
      await sleep(700);
      assert.equal(feedbackCues, cancelled, "Cancelled feedback completed later");
      device.client.command(feedbackId, {});
      await sleep(300);
      assert.equal(feedbackAccepted, accepted + 1, "Privacy allowed feedback");
      device.client.command(privacyId, { state: false });
      await waitFor("wake after feedback privacy", () => state() === "wake_word");
      device.client.command(entityId("button", "back_to_owy"), {});
      log.info("PASS privacy interrupts feedback, discards it, and restores wake");
    }

    for (let i = 0; i < 4; i++) {
      mode = "reply";
      durationMs = i === 3 ? 20 : 600;
      const before = requests;
      const completed = playbackCompletions;
      device.client.command(talkId, {});
      await waitFor("turn accepted", () => requests > before);
      await waitFor("reply sent", () => turn?.finished === true);
      await waitFor("physical playback complete", () => playbackCompletions > completed);
      await waitFor("wake word re-armed", () => state() === "wake_word");
      assert(micBytes > 0, "Microphone produced no audio");
      log.info(`PASS reply ${i + 1}: ${micBytes} mic bytes, ${turn!.audioBytesSent} speaker bytes, wake word re-armed`);
    }

    for (const scenario of ["silence", "decline", "cancel-listening", "cancel-speaking"] as const) {
      mode = scenario;
      durationMs = 4000;
      const before = requests;
      const stopBefore = stops;
      device.client.command(talkId, {});
      await waitFor("turn accepted", () => requests > before);
      if (scenario.startsWith("cancel")) {
        await waitFor("active turn", () => state() === (scenario === "cancel-speaking" ? "speaking" : "listening"));
        device.client.command(talkId, {});
        await waitFor("cancellation delivered", () => stops > stopBefore);
      } else if (scenario === "silence") {
        await waitFor("silence timeout", () => turn?.finished === true);
      }
      // Avoid accepting a cached wake_word value before firmware processes an error.
      await sleep(350);
      await waitFor("recovery", () => state() === "wake_word");
      log.info(`PASS ${scenario}: wake word re-armed`);
    }

    mode = "reply";
    durationMs = 2200;
    device.client.command(wakeId, { state: false });
    await waitFor("wake disabled", () => state() === "idle");
    device.client.command(talkId, {});
    await waitFor("speaking", () => state() === "speaking");
    if (hasFeedback) {
      const before = feedbackAccepted;
      device.client.command(feedbackId, {});
      await sleep(150);
      assert.equal(feedbackAccepted, before, "Decorative sound interrupted speech");
      log.info("PASS interaction sound suppressed during speech");
    }
    device.client.command(wakeId, { state: true });
    await sleep(250);
    assert.equal(state(), "speaking", "Enabling wake word interrupted playback");
    await waitFor("re-arm after switch", () => state() === "wake_word");
    log.info("PASS enable wake word during playback");

    device.client.command(entityId("button", "tono_de_prueba"), {});
    await sleep(400);
    await waitFor("tone finished", () => state() === "wake_word");
    log.info("PASS test tone with wake word enabled");

    // One activation, three replies, then a real eight-second silent window.
    mode = "follow-up";
    durationMs = 600;
    followUpReplies = 3;
    device.client.command(continuousId, { state: true });
    await waitFor("continuous mode enabled", () => switchState(continuousId) === true);
    const chainRequests = requests;
    const chainCompletions = playbackCompletions;
    const chainChimes = chimes;
    const chainGuards = idleGuards;
    device.client.command(talkId, {});
    await waitFor("three hands-free replies", () => playbackCompletions >= chainCompletions + 3, 15000);
    await waitFor("follow-up window open", () => requests === chainRequests + 4 && state() === "follow_up");
    const listeningAt = Date.now();
    await waitFor("silent follow-up returns to idle", () => state() === "wake_word", 10000);
    assert(Date.now() - listeningAt >= 7000, "Follow-up window closed too early");
    await sleep(1200);
    assert.equal(requests, chainRequests + 4, "Silence reopened another conversation");
    assert.equal(chimes - chainChimes, 4, "Each listening turn must have exactly one cue");
    assert.equal(idleGuards, chainGuards, "Normal silence needed the emergency guard");
    assert(micBytes > 0, "Follow-up microphone produced no audio");
    log.info("PASS three hands-free replies, four cues, silent timeout, no re-open loop");

    followUpReplies = 1;
    const disableRequests = requests;
    device.client.command(talkId, {});
    await waitFor("follow-up before disabling", () => requests === disableRequests + 2 && state() === "follow_up");
    device.client.command(continuousId, { state: false });
    await waitFor("disable stops follow-up", () => state() === "wake_word");
    log.info("PASS disabling continuous mode closes the open microphone");

    mode = "hung";
    const hungGuards = idleGuards;
    const hungStops = stops;
    device.client.command(talkId, {});
    await waitFor("hung bridge capture", () => state() === "listening");
    await waitFor("local idle guard", () => idleGuards > hungGuards && stops > hungStops, 11000);
    await waitFor("idle guard recovery", () => state() === "wake_word");
    log.info("PASS device closes a silent microphone even when the bridge sends no timeout");

    await verifyLongReply();

    durationMs = 600;
    for (const [id, value, label] of [[chimeId, false, "chime disabled"], [quietId, true, "quiet mode"]] as const) {
      device.client.command(chimeId, { state: true });
      device.client.command(id, { state: value });
      await waitFor(label, () => switchState(id) === value);
      const beforeChimes = chimes;
      const completed = playbackCompletions;
      device.client.command(talkId, {});
      await waitFor("uncued reply", () => playbackCompletions > completed);
      await waitFor("uncued re-arm", () => state() === "wake_word");
      assert.equal(chimes, beforeChimes, label);
      log.info(`PASS ${label}: listening works without a cue`);
    }
    device.client.command(quietId, { state: false });

    mode = "cancel-listening";
    const before = requests;
    device.client.command(talkId, {});
    await waitFor("turn before disconnect", () => requests > before);
    device.close();
    stopOutput();
    await sleep(1200);
    await connect();
    await waitFor("reconnect recovery", () => state() === "wake_word");
    log.info("PASS connection loss during capture and reconnect");
    assert.deepEqual(failures, []);
    log.info("PASS all hardware lifecycle checks (acoustic wake-word recognition still needs a spoken test)");
  } finally {
    clearInterval(visualEnvelope);
    clearInterval(metrics);
    stopOutput();
    if (originalWake !== undefined) {
      device.client.command(wakeId, { state: originalWake });
      for (const [id, state] of restoreSwitches) device.client.command(id, { state });
      await sleep(200);
    }
    device.close();
  }
}

function tone(ms: number): Buffer {
  const samples = Math.round(ms * 16);
  const out = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    const envelope = Math.min(1, i / 160, (samples - 1 - i) / 160);
    out.writeInt16LE(Math.round(3500 * envelope * Math.sin(2 * Math.PI * 660 * i / 16000)), i * 2);
  }
  return out;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
