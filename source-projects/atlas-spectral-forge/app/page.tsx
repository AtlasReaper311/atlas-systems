"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AudioScope } from "./components/AudioScope";
import { OutputMeter } from "./components/OutputMeter";
import { Sparkline, Timeline, TransformCurve } from "./components/SignalVisuals";
import { SpectralField } from "./components/SpectralField";
import {
  AudioParameters,
  createAudioContext,
  SignalForgeAudioEngine,
  TargetSmoothing,
} from "./lib/audio-engine";
import {
  BUILT_IN_PRESETS,
  Mapping,
  PlaybackState,
  Preset,
  SCENARIOS,
  SCENARIO_BY_ID,
  SIGNALS,
  SIGNAL_BY_ID,
  ScenarioId,
  SignalId,
  SmoothingType,
  TARGETS,
  TARGET_BY_ID,
  TargetId,
  TransformType,
  calculateMapping,
  cloneMappings,
  createFrame,
  formatTime,
  formatValue,
} from "./lib/signal-forge";

type DepthMode = "PLAY" | "FORGE" | "ANALYSE";
type AnalysisView = "SIGNAL" | "AUDIO";
type MappingVariant = "A" | "B";

interface StoredForgeState {
  userPresets: Preset[];
  lastPresetId: string;
  depth: DepthMode;
  masterLevel: number;
}

const STORAGE_KEY = "atlas-spectral-forge:v2";
const LEGACY_STORAGE_KEY = "atlas-signal-forge:v1";
const initialFrame = createFrame("normal", 0);
const initialMappings = cloneMappings(BUILT_IN_PRESETS[0].mappings);
const PLAY_SIGNALS: SignalId[] = ["request_rate", "latency_ms", "error_rate", "cache_hit_rate", "anomaly_score"];

const HARMONIC_STATES = {
  STABLE: "CRYSTALLINE / OPEN FIFTH",
  PRESSURED: "COMPRESSED / TENSE FOURTH",
  DEGRADED: "ASYMMETRIC / NARROW SIXTH",
  FAILED: "FRACTURED / MINOR TENSION",
  RECOVERING: "COHERENCE RETURNING",
} as const;

function isTypingTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && target.matches("input, textarea, select, [contenteditable='true']");
}

function safePresetId(name: string, index: number) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return `user-${index + 1}-${slug || "preset"}`;
}

export default function SpectralForge() {
  const [scenarioId, setScenarioId] = useState<ScenarioId>("normal");
  const [playback, setPlayback] = useState<PlaybackState>("STOPPED");
  const [time, setTime] = useState(0);
  const [frame, setFrame] = useState(initialFrame);
  const [history, setHistory] = useState([initialFrame]);
  const [depth, setDepth] = useState<DepthMode>("PLAY");
  const [analysisView, setAnalysisView] = useState<AnalysisView>("SIGNAL");
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const [showMoreSignals, setShowMoreSignals] = useState(false);
  const [selectedSignal, setSelectedSignal] = useState<SignalId>("latency_ms");
  const [selectedMappingId, setSelectedMappingId] = useState("ref-latency-filter");
  const [pendingSource, setPendingSource] = useState<SignalId | null>(null);
  const [routeCreatorOpen, setRouteCreatorOpen] = useState(false);
  const [mappingVariant, setMappingVariant] = useState<MappingVariant>("A");
  const [mappingSlots, setMappingSlots] = useState<Record<MappingVariant, Mapping[]>>({
    A: initialMappings,
    B: cloneMappings(initialMappings),
  });
  const [soloRoute, setSoloRoute] = useState(false);
  const [presetId, setPresetId] = useState("reference");
  const [userPresets, setUserPresets] = useState<Preset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [audioMuted, setAudioMuted] = useState(false);
  const [audioError, setAudioError] = useState("");
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [masterLevel, setMasterLevel] = useState(0.4);
  const [notice, setNotice] = useState("SIMULATED · Synthetic deterministic telemetry · No production data connected");

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioEngineRef = useRef<SignalForgeAudioEngine | null>(null);
  const routeSequenceRef = useRef(0);

  const scenario = SCENARIO_BY_ID[scenarioId];
  const mappings = mappingSlots[mappingVariant];
  const selectedMapping = mappings.find((mapping) => mapping.id === selectedMappingId) ?? mappings[0] ?? null;
  const selectedCalculation = selectedMapping
    ? calculateMapping(selectedMapping, frame.normalised[selectedMapping.source])
    : null;
  const allPresets = useMemo(() => [...BUILT_IN_PRESETS, ...userPresets], [userPresets]);
  const currentPreset = allPresets.find((preset) => preset.id === presetId) ?? null;
  const harmonicState = HARMONIC_STATES[frame.health];

  const setMappings = useCallback((update: Mapping[] | ((current: Mapping[]) => Mapping[])) => {
    setMappingSlots((current) => {
      const currentMappings = current[mappingVariant];
      const nextMappings = typeof update === "function" ? update(currentMappings) : update;
      return { ...current, [mappingVariant]: nextMappings };
    });
  }, [mappingVariant]);

  const outputByTarget = useMemo<AudioParameters>(() => Object.fromEntries(
    TARGETS.map((target) => {
      const mapping = mappings.find((candidate) => candidate.target === target.id && candidate.enabled);
      const value = mapping
        ? calculateMapping(mapping, frame.normalised[mapping.source]).output
        : target.defaultValue;
      return [target.id, value];
    }),
  ) as AudioParameters, [frame, mappings]);

  const audibleOutputByTarget = useMemo<AudioParameters>(() => {
    if (!soloRoute || !selectedMapping || !selectedMapping.enabled) return outputByTarget;
    const neutral = Object.fromEntries(TARGETS.map((target) => [target.id, target.defaultValue])) as AudioParameters;
    neutral[selectedMapping.target] = outputByTarget[selectedMapping.target];
    return neutral;
  }, [outputByTarget, selectedMapping, soloRoute]);

  const targetSmoothing = useMemo<TargetSmoothing>(() => Object.fromEntries(
    mappings.filter((mapping) => mapping.enabled).map((mapping) => [mapping.target, mapping.smoothing]),
  ) as TargetSmoothing, [mappings]);

  const resetRun = useCallback((nextScenario: ScenarioId = scenarioId) => {
    audioEngineRef.current?.safeReset();
    const first = createFrame(nextScenario, 0);
    setPlayback("STOPPED");
    setTime(0);
    setFrame(first);
    setHistory([first]);
    setScenarioOpen(false);
    setNotice(`${SCENARIO_BY_ID[nextScenario].label} · deterministic run reset to 00:00.0`);
  }, [scenarioId]);

  const selectScenario = useCallback((nextScenario: ScenarioId) => {
    setScenarioId(nextScenario);
    resetRun(nextScenario);
  }, [resetRun]);

  const stepScenario = useCallback((direction: -1 | 1) => {
    const currentIndex = SCENARIOS.findIndex((candidate) => candidate.id === scenarioId);
    const nextIndex = (currentIndex + direction + SCENARIOS.length) % SCENARIOS.length;
    selectScenario(SCENARIOS[nextIndex].id);
  }, [scenarioId, selectScenario]);

  const togglePlayback = useCallback(() => {
    if (playback === "COMPLETE") {
      resetRun();
      queueMicrotask(() => setPlayback("PLAYING"));
      return;
    }
    setPlayback((current) => current === "PLAYING" ? "PAUSED" : "PLAYING");
  }, [playback, resetRun]);

  const enableAudio = useCallback(async () => {
    if (audioEnabled || audioEngineRef.current) return;
    try {
      const engine = new SignalForgeAudioEngine(createAudioContext());
      audioEngineRef.current = engine;
      await engine.activate(masterLevel);
      setAnalyser(engine.analyser);
      setAudioEnabled(true);
      setAudioMuted(false);
      setAudioError("");
      setNotice("Audio enabled · post-master safety stage active · M mutes immediately");
    } catch (error) {
      setAudioError(error instanceof Error ? error.message : "The audio context could not be created.");
      setNotice("Audio engine unavailable · simulation and mapping inspection remain active");
    }
  }, [audioEnabled, masterLevel]);

  const toggleMute = useCallback(() => {
    if (!audioEnabled || !audioEngineRef.current) return;
    setAudioMuted((current) => {
      audioEngineRef.current?.setMuted(!current);
      setNotice(!current ? "Actual audio output muted · mapped field remains visible" : "Audio output restored at the saved level");
      return !current;
    });
  }, [audioEnabled]);

  useEffect(() => {
    if (playback !== "PLAYING") return;
    intervalRef.current = setInterval(() => {
      setTime((current) => {
        const nextTime = Math.min(60, Number((current + 0.1).toFixed(1)));
        const nextFrame = createFrame(scenarioId, nextTime);
        setFrame(nextFrame);
        setHistory((currentHistory) => [...currentHistory, nextFrame].slice(-601));
        if (nextTime >= 60) setPlayback("COMPLETE");
        return nextTime;
      });
    }, 100);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [playback, scenarioId]);

  useEffect(() => {
    if (!audioEngineRef.current || !audioEnabled) return;
    audioEngineRef.current.update(audibleOutputByTarget, targetSmoothing, frame.health, frame.deployEvent);
  }, [audibleOutputByTarget, audioEnabled, frame.deployEvent, frame.health, targetSmoothing]);

  useEffect(() => {
    let cancelled = false;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY);
      let restoredUsers: Preset[] = [];
      let restoredDepth: DepthMode | null = null;
      let restoredMaster: number | null = null;
      let restoredPreset: Preset | null = null;
      if (raw) {
        const stored = JSON.parse(raw) as Partial<StoredForgeState> & { view?: string };
        restoredUsers = Array.isArray(stored.userPresets)
          ? stored.userPresets.filter((preset) => !preset.builtIn && Array.isArray(preset.mappings))
          : [];
        if (stored.depth === "PLAY" || stored.depth === "FORGE" || stored.depth === "ANALYSE") restoredDepth = stored.depth;
        if (typeof stored.masterLevel === "number") restoredMaster = Math.min(0.71, Math.max(0.18, stored.masterLevel < 0.18 ? 0.4 : stored.masterLevel));
        restoredPreset = [...BUILT_IN_PRESETS, ...restoredUsers].find((preset) => preset.id === stored.lastPresetId) ?? null;
      }
      window.localStorage.setItem(`${STORAGE_KEY}:probe`, "1");
      window.localStorage.removeItem(`${STORAGE_KEY}:probe`);
      queueMicrotask(() => {
        if (cancelled) return;
        setUserPresets(restoredUsers);
        if (restoredDepth) setDepth(restoredDepth);
        if (restoredMaster !== null) setMasterLevel(restoredMaster);
        if (restoredPreset) {
          const restoredMappings = cloneMappings(restoredPreset.mappings);
          setMappingSlots({ A: restoredMappings, B: cloneMappings(restoredMappings) });
          setPresetId(restoredPreset.id);
          setSelectedMappingId(restoredMappings[0]?.id ?? "");
        }
        setStorageReady(true);
      });
    } catch {
      queueMicrotask(() => {
        if (cancelled) return;
        setStorageAvailable(false);
        setStorageReady(true);
        setNotice("LOCAL PRESET STORAGE UNAVAILABLE · current-session editing remains active");
      });
    }
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!storageReady || !storageAvailable) return;
    try {
      const stored: StoredForgeState = { userPresets, lastPresetId: presetId, depth, masterLevel };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch {
      queueMicrotask(() => {
        setStorageAvailable(false);
        setNotice("LOCAL PRESET STORAGE UNAVAILABLE · current-session editing remains active");
      });
    }
  }, [depth, masterLevel, presetId, storageAvailable, storageReady, userPresets]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setHelpOpen(false);
        setSaveOpen(false);
        setResetOpen(false);
        setScenarioOpen(false);
        return;
      }
      if (isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (event.key === " ") {
        event.preventDefault();
        togglePlayback();
      } else if (key === "r") resetRun();
      else if (key === "m") toggleMute();
      else if (key === "p") setDepth("PLAY");
      else if (key === "f") setDepth("FORGE");
      else if (key === "a") setDepth("ANALYSE");
      else if (event.key === "?") setHelpOpen(true);
      else if (/^[1-7]$/.test(event.key)) selectScenario(SCENARIOS[Number(event.key) - 1].id);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [resetRun, selectScenario, toggleMute, togglePlayback]);

  useEffect(() => () => {
    void audioEngineRef.current?.dispose();
    audioEngineRef.current = null;
  }, []);

  function changeMasterLevel(value: number) {
    const safeValue = Math.min(0.71, Math.max(0.18, value));
    setMasterLevel(safeValue);
    audioEngineRef.current?.setMasterLevel(safeValue);
  }

  function updateMapping(patch: Partial<Mapping>) {
    if (!selectedMapping) return;
    setMappings((current) => current.map((mapping) => mapping.id === selectedMapping.id ? { ...mapping, ...patch } : mapping));
    setPresetId("custom-session");
  }

  function selectRoute(mapping: Mapping) {
    setSelectedMappingId(mapping.id);
    setSelectedSignal(mapping.source);
    setPendingSource(null);
  }

  function createRoute(target: TargetId) {
    if (!pendingSource) return;
    const occupied = mappings.find((mapping) => mapping.target === target);
    const targetDefinition = TARGET_BY_ID[target];
    routeSequenceRef.current += 1;
    const mapping: Mapping = {
      id: `route-${pendingSource}-${target}-${routeSequenceRef.current}`,
      source: pendingSource,
      target,
      transform: "LINEAR",
      inputMin: 0,
      inputMax: 1,
      outputMin: targetDefinition.min,
      outputMax: targetDefinition.max,
      polarity: "NORMAL",
      smoothing: "MEDIUM",
      enabled: true,
    };
    setMappings((current) => [...current.filter((candidate) => candidate.target !== target), mapping]);
    setSelectedMappingId(mapping.id);
    setSelectedSignal(mapping.source);
    setPendingSource(null);
    setRouteCreatorOpen(false);
    setPresetId("custom-session");
    setNotice(occupied
      ? `${targetDefinition.label} reassigned to ${SIGNAL_BY_ID[mapping.source].label} in mapping ${mappingVariant}`
      : `${SIGNAL_BY_ID[mapping.source].label} routed to ${targetDefinition.label} in mapping ${mappingVariant}`);
  }

  function removeSelectedMapping() {
    if (!selectedMapping) return;
    const remaining = mappings.filter((mapping) => mapping.id !== selectedMapping.id);
    setMappings(remaining);
    setSelectedMappingId(remaining[0]?.id ?? "");
    setSoloRoute(false);
    setPresetId("custom-session");
    setNotice(`${SIGNAL_BY_ID[selectedMapping.source].label} → ${TARGET_BY_ID[selectedMapping.target].label} removed from mapping ${mappingVariant}`);
  }

  function switchVariant(nextVariant: MappingVariant) {
    setMappingVariant(nextVariant);
    setSoloRoute(false);
    const nextMappings = mappingSlots[nextVariant];
    if (!nextMappings.some((mapping) => mapping.id === selectedMappingId)) setSelectedMappingId(nextMappings[0]?.id ?? "");
    setNotice(`Mapping ${nextVariant} selected · telemetry and simulation time unchanged`);
  }

  function copyAToB() {
    setMappingSlots((current) => ({ ...current, B: cloneMappings(current.A) }));
    setMappingVariant("B");
    setSoloRoute(false);
    setSelectedMappingId(mappingSlots.A[0]?.id ?? "");
    setPresetId("custom-session");
    setNotice("Mapping A copied to B · modify B, reset the run, then compare identical telemetry");
  }

  function loadPreset(nextPresetId: string) {
    const preset = allPresets.find((candidate) => candidate.id === nextPresetId);
    if (!preset) return;
    const nextMappings = cloneMappings(preset.mappings);
    setMappingSlots({ A: nextMappings, B: cloneMappings(nextMappings) });
    setMappingVariant("A");
    setPresetId(preset.id);
    setSelectedMappingId(nextMappings[0]?.id ?? "");
    setSoloRoute(false);
    setNotice(`${preset.name} loaded into A and B · playback state preserved`);
  }

  function savePreset() {
    const name = presetName.trim();
    if (!name) {
      setNotice("Preset name is required");
      return;
    }
    const existing = userPresets.find((preset) => preset.name.toLowerCase() === name.toLowerCase());
    const saved: Preset = {
      id: existing?.id ?? safePresetId(name, userPresets.length),
      name: name.toUpperCase(),
      builtIn: false,
      mappings: cloneMappings(mappings),
    };
    setUserPresets((current) => [...current.filter((preset) => preset.id !== saved.id), saved]);
    setPresetId(saved.id);
    setPresetName("");
    setSaveOpen(false);
    setNotice(`${saved.name} saved from mapping ${mappingVariant}${storageAvailable ? " to this browser" : " for this session"}`);
  }

  function deleteCurrentPreset() {
    if (!currentPreset || currentPreset.builtIn) return;
    const deleted = currentPreset.name;
    setUserPresets((current) => current.filter((preset) => preset.id !== currentPreset.id));
    loadPreset("reference");
    setNotice(`${deleted} deleted · Reference Map restored`);
  }

  function resetReference() {
    loadPreset("reference");
    setResetOpen(false);
    setNotice("Reference Map restored to its shipped deterministic configuration");
  }

  const selectedRaises = selectedMapping
    ? (selectedMapping.transform !== "INVERSE") !== (selectedMapping.polarity === "REVERSED")
    : true;
  const phaseCount = scenario.phaseBoundaries.length - 1;

  return (
    <main className={`spectral-shell depth-${depth.toLowerCase()}`}>
      <a className="skip-link" href="#instrument">Skip to instrument</a>

      <header className="atlas-shell">
        <a className="atlas-shell__identity" href="https://atlas-systems.uk/" aria-label="Return to Atlas Systems">
          <span className="atlas-mark" aria-hidden="true">A</span>
          <span><strong>ATLAS SYSTEMS</strong><small>PUBLIC TECHNICAL ESTATE</small></span>
        </a>
        <span className="atlas-shell__context">LAB / FLAGSHIP EXPERIMENT</span>
        <nav className="atlas-shell__escape" aria-label="Atlas Systems escape routes">
          <a href="https://atlas-systems.uk/lab/">LAB</a>
          <a href="https://atlas-systems.uk/">ATLAS SYSTEMS ↗</a>
        </nav>
      </header>

      <section className="product-strip">
        <div className="product-identity">
          <span className="product-identity__eyebrow">TELEMETRY SONIFICATION INSTRUMENT</span>
          <h1><span>Spectral</span> <em>Forge</em></h1>
          <p>Map system behaviour into sound. <span>Change the mapping. Hear the consequence.</span></p>
        </div>
        <div className="evidence-block" aria-label="Evidence mode">
          <strong>SIMULATED</strong>
          <span>Synthetic deterministic telemetry</span>
          <small>No production Atlas Systems data connected</small>
        </div>
      </section>

      <nav className="depth-nav" aria-label="Instrument depth">
        {(["PLAY", "FORGE", "ANALYSE"] as DepthMode[]).map((mode, index) => (
          <button key={mode} className={depth === mode ? "is-active" : ""} aria-pressed={depth === mode} onClick={() => setDepth(mode)}>
            <small>0{index + 1}</small><strong>{mode}</strong><span>{mode === "PLAY" ? "EXPERIENCE THE SYSTEM" : mode === "FORGE" ? "SHAPE THE TRANSLATION" : "INSPECT WHAT CHANGED"}</span>
          </button>
        ))}
      </nav>

      <section className="instrument-bar" aria-label="Persistent scenario, transport and audio controls">
        <div className="scenario-control">
          <span className="control-label">SCENARIO</span>
          <button className="square-control" onClick={() => stepScenario(-1)} aria-label="Previous scenario">←</button>
          <button className="scenario-current" onClick={() => setScenarioOpen((current) => !current)} aria-expanded={scenarioOpen}>
            <span>{scenario.number}</span><strong>{scenario.label}</strong><i>⌄</i>
          </button>
          <button className="square-control" onClick={() => stepScenario(1)} aria-label="Next scenario">→</button>
          {scenarioOpen && (
            <div className="scenario-menu" role="menu" aria-label="Select deterministic scenario">
              {SCENARIOS.map((candidate) => (
                <button key={candidate.id} role="menuitem" className={candidate.id === scenarioId ? "is-active" : ""} onClick={() => selectScenario(candidate.id)}>
                  <span>{candidate.number}</span><strong>{candidate.label}</strong><small>{candidate.note}</small>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="transport-controls">
          <button className="transport-primary" onClick={togglePlayback}>{playback === "PLAYING" ? "PAUSE" : playback === "COMPLETE" ? "REPLAY" : "PLAY"}</button>
          <button className="transport-secondary" onClick={() => resetRun()}>RESET RUN</button>
          <span className="simulation-clock"><strong>{formatTime(time)}</strong><small>{playback}</small></span>
        </div>

        <div className="audio-master">
          {!audioEnabled ? (
            <button className="audio-enable" onClick={enableAudio}>ENABLE AUDIO</button>
          ) : (
            <button className={audioMuted ? "audio-enable" : "audio-mute"} onClick={toggleMute}>{audioMuted ? "UNMUTE" : "MUTE"}</button>
          )}
          <label>
            <span>MASTER <b>{Math.round(20 * Math.log10(masterLevel))} dB</b></span>
            <input aria-label="Master output level" type="range" min="0.18" max="0.71" step="0.01" value={masterLevel} onChange={(event) => changeMasterLevel(Number(event.target.value))} />
          </label>
        </div>
      </section>

      <div id="instrument" className="instrument-depth">
        {depth === "PLAY" && (
          <section className="play-mode" aria-label="Play mode">
            <div className="play-field-wrap">
              <SpectralField
                frame={frame}
                outputs={outputByTarget}
                scenarioId={scenarioId}
                playback={playback}
                audioEnabled={audioEnabled}
                muted={audioMuted}
                selectedMapping={null}
                soloRoute={false}
                variant={mappingVariant}
              />
              {playback === "STOPPED" && (
                <div className="first-use-cue">
                  <span>TELEMETRY ENTERS AS BEHAVIOUR</span>
                  <strong>It leaves as sound.</strong>
                  <small>{audioEnabled ? "Select PLAY to begin the deterministic run." : "Enable audio, then select PLAY."}</small>
                </div>
              )}
            </div>

            <div className="play-rails">
              <section className="state-rail" aria-labelledby="signal-state-title">
                <div className="rail-heading"><span>SIMULATION STATE</span><strong id="signal-state-title">SIGNAL STATE</strong></div>
                <div className="signal-state-grid">
                  {PLAY_SIGNALS.map((signalId) => {
                    const signal = SIGNAL_BY_ID[signalId];
                    return <span key={signalId}><small>{signal.label}</small><strong>{formatValue(frame.values[signalId], signal.decimals)} <i>{signal.unit}</i></strong></span>;
                  })}
                  {showMoreSignals && (
                    <>
                      <span><small>QUEUE DEPTH</small><strong>{frame.values.queue_depth.toFixed(0)} <i>jobs</i></strong></span>
                      <span><small>CPU LOAD</small><strong>{frame.values.cpu_load.toFixed(1)} <i>%</i></strong></span>
                      <span><small>HEALTH MODEL</small><strong>{frame.health}</strong></span>
                      <span><small>DEPLOY EVENT</small><strong>{frame.deployEvent ? "FIRED" : "IDLE"}</strong></span>
                    </>
                  )}
                </div>
                <button className="text-control" onClick={() => setShowMoreSignals((current) => !current)}>{showMoreSignals ? "− HIDE EXTENDED SIGNALS" : "+ 4 MORE SIGNALS"}</button>
              </section>

              <section className="state-rail sonic-state" aria-labelledby="sonic-state-title">
                <div className="rail-heading"><span>MAPPED SONIC STATE</span><strong id="sonic-state-title">{harmonicState}</strong></div>
                <div className="sonic-state-grid">
                  <span><small>PULSE</small><strong>{outputByTarget.pulse_rate.toFixed(2)} <i>Hz</i></strong></span>
                  <span><small>FILTER</small><strong>{(outputByTarget.filter_cutoff / 1000).toFixed(2)} <i>kHz</i></strong></span>
                  <span><small>INSTABILITY</small><strong>{outputByTarget.instability.toFixed(1)} <i>ct</i></strong></span>
                  <span><small>TEXTURE</small><strong>{outputByTarget.texture_density.toFixed(0)} <i>%</i></strong></span>
                </div>
                <button className="text-control" onClick={() => { setDepth("ANALYSE"); setAnalysisView("AUDIO"); }}>OPEN AUDIO ENGINE →</button>
              </section>

              <section className="state-rail current-route" aria-labelledby="current-route-title">
                <div className="rail-heading"><span>SELECTED TRANSFORMATION / {mappingVariant}</span><strong id="current-route-title">{selectedMapping ? `${SIGNAL_BY_ID[selectedMapping.source].label} → ${TARGET_BY_ID[selectedMapping.target].label}` : "NO ACTIVE ROUTE"}</strong></div>
                {selectedMapping && selectedCalculation && (
                  <div className="route-glance">
                    <span><small>RAW</small><strong>{frame.values[selectedMapping.source].toFixed(SIGNAL_BY_ID[selectedMapping.source].decimals)} {SIGNAL_BY_ID[selectedMapping.source].unit}</strong></span>
                    <i>→</i><span><small>{selectedMapping.transform}</small><strong>{selectedCalculation.transformed.toFixed(3)}</strong></span>
                    <i>→</i><span><small>OUTPUT</small><strong>{selectedCalculation.output.toFixed(TARGET_BY_ID[selectedMapping.target].decimals)} {TARGET_BY_ID[selectedMapping.target].unit}</strong></span>
                  </div>
                )}
                <button className="text-control" onClick={() => setDepth("FORGE")}>OPEN IN FORGE →</button>
              </section>

              <OutputMeter analyser={analyser} active={audioEnabled} muted={audioMuted} compact />
            </div>

            <section className="causal-narrative" aria-labelledby="causal-title">
              <div className="causal-narrative__heading">
                <span>CAUSAL TIMELINE</span>
                <strong id="causal-title">PHASE {String(frame.phaseIndex).padStart(2, "0")} / {String(phaseCount).padStart(2, "0")} · {frame.phaseTitle}</strong>
                <p>{frame.phaseDescription}</p>
              </div>
              <Timeline history={history} selectedSignal={selectedSignal} scenario={scenario} time={time} />
            </section>
          </section>
        )}

        {depth === "FORGE" && (
          <section className="forge-mode" aria-label="Forge mode">
            <header className="mode-intro">
              <div><span>FORGE</span><h2>Shape the translation between signal and sound.</h2></div>
              <div className="compare-controls" aria-label="Deterministic mapping comparison">
                <span>A/B MAPPING · TELEMETRY UNCHANGED</span>
                <button className={mappingVariant === "A" ? "is-active" : ""} onClick={() => switchVariant("A")} aria-pressed={mappingVariant === "A"}><small>A</small>REFERENCE</button>
                <button className={mappingVariant === "B" ? "is-active" : ""} onClick={() => switchVariant("B")} aria-pressed={mappingVariant === "B"}><small>B</small>MODIFIED</button>
                <button className="compare-copy" onClick={copyAToB}>COPY A → B</button>
              </div>
              <div className="preset-control">
                <label><span>PRESET</span><select value={presetId} onChange={(event) => loadPreset(event.target.value)}>
                  {allPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
                  {presetId === "custom-session" && <option value="custom-session">EDITED SESSION</option>}
                </select></label>
                <button onClick={() => setSaveOpen(true)}>SAVE</button>
                <button onClick={() => setResetOpen(true)}>RESET</button>
                {currentPreset && !currentPreset.builtIn && <button className="danger-text" onClick={deleteCurrentPreset}>DELETE</button>}
              </div>
            </header>

            <div className="forge-workspace">
              <aside className="route-rack" aria-labelledby="route-rack-title">
                <div className="section-heading"><span>ACTIVE ROUTES / {mappings.length}</span><h3 id="route-rack-title">Signal paths</h3></div>
                <div className="route-rack__list">
                  {mappings.map((mapping, index) => (
                    <button key={mapping.id} className={`${selectedMapping?.id === mapping.id ? "is-active" : ""} ${mapping.enabled ? "" : "is-bypassed"}`} onClick={() => selectRoute(mapping)}>
                      <span className="patch-jack" aria-hidden="true" />
                      <small>{String(index + 1).padStart(2, "0")}</small>
                      <strong>{SIGNAL_BY_ID[mapping.source].label}</strong>
                      <i>→</i>
                      <strong>{TARGET_BY_ID[mapping.target].label}</strong>
                      <em>{mapping.enabled ? mapping.transform : "BYPASSED"}</em>
                    </button>
                  ))}
                </div>
                <button className="create-route-button" onClick={() => setRouteCreatorOpen((current) => !current)}>+ CREATE ROUTE</button>
                {routeCreatorOpen && (
                  <div className="route-creator">
                    <div><span>1 / SELECT SIGNAL</span>{SIGNALS.map((signal) => <button key={signal.id} className={pendingSource === signal.id ? "is-active" : ""} onClick={() => setPendingSource(signal.id)}><i className="patch-jack" />{signal.label}</button>)}</div>
                    <div><span>2 / SELECT TARGET</span>{TARGETS.map((target) => {
                      const occupied = mappings.find((mapping) => mapping.target === target.id);
                      return <button key={target.id} disabled={!pendingSource} onClick={() => createRoute(target.id)}><i className="patch-jack" />{target.label}<small>{occupied ? `REPLACE ${SIGNAL_BY_ID[occupied.source].label}` : "AVAILABLE"}</small></button>;
                    })}</div>
                  </div>
                )}
              </aside>

              <div className="forge-field">
                <SpectralField
                  frame={frame}
                  outputs={audibleOutputByTarget}
                  scenarioId={scenarioId}
                  playback={playback}
                  audioEnabled={audioEnabled}
                  muted={audioMuted}
                  selectedMapping={selectedMapping}
                  soloRoute={soloRoute}
                  variant={mappingVariant}
                  compact
                />
                <button className={`solo-route ${soloRoute ? "is-active" : ""}`} onClick={() => setSoloRoute((current) => !current)} disabled={!selectedMapping} aria-pressed={soloRoute}>
                  <span className="solo-route__switch"><i /></span>
                  <span><strong>SOLO ROUTE</strong><small>{soloRoute ? "Unrelated routes held at neutral reference" : "Hear one mapping contribution"}</small></span>
                </button>
              </div>

              <aside className="route-inspector" aria-labelledby="route-inspector-title">
                {selectedMapping && selectedCalculation ? (
                  <>
                    <div className="section-heading"><span>SELECTED ROUTE / {mappingVariant}</span><h3 id="route-inspector-title">{SIGNAL_BY_ID[selectedMapping.source].label} → {TARGET_BY_ID[selectedMapping.target].label}</h3></div>
                    <div className="transformation-chain">
                      <span><small>SOURCE / RAW VALUE</small><strong>{frame.values[selectedMapping.source].toFixed(SIGNAL_BY_ID[selectedMapping.source].decimals)} <i>{SIGNAL_BY_ID[selectedMapping.source].unit}</i></strong></span>
                      <b>↓ <small>NORMALISE</small></b>
                      <span><small>NORMALISED VALUE</small><strong>{selectedCalculation.rawNormalised.toFixed(3)}</strong></span>
                      <b>↓ <small>{selectedMapping.transform}</small></b>
                      <span><small>TRANSFORMED VALUE</small><strong>{selectedCalculation.transformed.toFixed(3)}</strong></span>
                      <b>↓ <small>BOUNDED RANGE</small></b>
                      <span><small>CURRENT OUTPUT</small><strong>{selectedCalculation.output.toFixed(TARGET_BY_ID[selectedMapping.target].decimals)} <i>{TARGET_BY_ID[selectedMapping.target].unit}</i></strong></span>
                      <b>↓</b>
                      <span><small>AUDIO TARGET</small><strong>{TARGET_BY_ID[selectedMapping.target].label}</strong></span>
                    </div>
                    <TransformCurve mapping={selectedMapping} />
                    <div className="inspector-control-grid">
                      <label><span>TRANSFORM</span><select value={selectedMapping.transform} onChange={(event) => updateMapping({ transform: event.target.value as TransformType })}>{(["LINEAR", "INVERSE", "EXPONENTIAL", "THRESHOLD"] as TransformType[]).map((item) => <option key={item}>{item}</option>)}</select></label>
                      <label><span>POLARITY</span><select value={selectedMapping.polarity} onChange={(event) => updateMapping({ polarity: event.target.value as Mapping["polarity"] })}><option>NORMAL</option><option>REVERSED</option></select></label>
                      <label><span>SMOOTHING</span><select value={selectedMapping.smoothing} onChange={(event) => updateMapping({ smoothing: event.target.value as SmoothingType })}>{(["IMMEDIATE", "FAST", "MEDIUM", "SLOW"] as SmoothingType[]).map((item) => <option key={item}>{item}</option>)}</select></label>
                      <label><span>INPUT MIN</span><input type="number" value={selectedMapping.inputMin} min="0" max={Math.max(0, selectedMapping.inputMax - 0.01)} step="0.05" onChange={(event) => updateMapping({ inputMin: Number(event.target.value) })} /></label>
                      <label><span>INPUT MAX</span><input type="number" value={selectedMapping.inputMax} min={Math.min(1, selectedMapping.inputMin + 0.01)} max="1" step="0.05" onChange={(event) => updateMapping({ inputMax: Number(event.target.value) })} /></label>
                      <label><span>OUTPUT MIN</span><input type="number" value={selectedMapping.outputMin} min={TARGET_BY_ID[selectedMapping.target].min} max={selectedMapping.outputMax} step="0.1" onChange={(event) => updateMapping({ outputMin: Number(event.target.value) })} /></label>
                      <label><span>OUTPUT MAX</span><input type="number" value={selectedMapping.outputMax} min={selectedMapping.outputMin} max={TARGET_BY_ID[selectedMapping.target].max} step="0.1" onChange={(event) => updateMapping({ outputMax: Number(event.target.value) })} /></label>
                    </div>
                    <p className="route-explanation">Higher {SIGNAL_BY_ID[selectedMapping.source].label.toLowerCase()} currently {selectedRaises ? "raises" : "lowers"} {TARGET_BY_ID[selectedMapping.target].label.toLowerCase()} after a {selectedMapping.smoothing.toLowerCase()} response.</p>
                    <div className="inspector-actions"><button onClick={() => updateMapping({ enabled: !selectedMapping.enabled })}>{selectedMapping.enabled ? "BYPASS" : "ENABLE"}</button><button className="danger-text" onClick={removeSelectedMapping}>REMOVE</button></div>
                  </>
                ) : <div className="inspector-empty">Select a route to inspect its transformation.</div>}
              </aside>
            </div>
          </section>
        )}

        {depth === "ANALYSE" && (
          <section className="analyse-mode" aria-label="Analyse mode">
            <header className="mode-intro analyse-intro">
              <div><span>ANALYSE</span><h2>Inspect what changed and why.</h2></div>
              <div className="analysis-tabs" aria-label="Analysis view">
                <button className={analysisView === "SIGNAL" ? "is-active" : ""} onClick={() => setAnalysisView("SIGNAL")} aria-pressed={analysisView === "SIGNAL"}>SIGNAL</button>
                <button className={analysisView === "AUDIO" ? "is-active" : ""} onClick={() => setAnalysisView("AUDIO")} aria-pressed={analysisView === "AUDIO"}>AUDIO</button>
              </div>
            </header>

            {analysisView === "SIGNAL" ? (
              <div className="signal-analysis">
                <section className="telemetry-analysis" aria-labelledby="telemetry-analysis-title">
                  <div className="section-heading"><span>SIMULATED SIGNAL BANK</span><h3 id="telemetry-analysis-title">Raw and normalised telemetry</h3></div>
                  <div className="analysis-signal-list">
                    {SIGNALS.map((signal) => (
                      <button key={signal.id} className={selectedSignal === signal.id ? "is-active" : ""} onClick={() => setSelectedSignal(signal.id)}>
                        <span><strong>{signal.label}</strong><small>{mappings.filter((mapping) => mapping.source === signal.id).length} ROUTES</small></span>
                        <Sparkline values={history.map((entry) => entry.normalised[signal.id])} label={signal.label} />
                        <span><strong>{formatValue(frame.values[signal.id], signal.decimals)} <i>{signal.unit}</i></strong><small>NORM {frame.normalised[signal.id].toFixed(3)}</small></span>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="phase-analysis" aria-labelledby="phase-analysis-title">
                  <div className="section-heading"><span>DETERMINISTIC RUN STATE</span><h3 id="phase-analysis-title">{scenario.number} / {scenario.label}</h3></div>
                  <div className="phase-analysis__state"><span><small>TIME</small><strong>{formatTime(time)}</strong></span><span><small>PLAYBACK</small><strong>{playback}</strong></span><span><small>HEALTH MODEL</small><strong>{frame.health}</strong></span><span><small>PHASE</small><strong>{frame.phaseIndex} / {phaseCount}</strong></span></div>
                  <h4>{frame.phaseTitle}</h4><p>{frame.phaseDescription}</p>
                  {selectedMapping && selectedCalculation && (
                    <div className="analysis-chain">
                      <span><small>RAW</small><strong>{frame.values[selectedMapping.source].toFixed(SIGNAL_BY_ID[selectedMapping.source].decimals)} {SIGNAL_BY_ID[selectedMapping.source].unit}</strong></span><i>→</i>
                      <span><small>NORMALISED</small><strong>{selectedCalculation.rawNormalised.toFixed(3)}</strong></span><i>→</i>
                      <span><small>{selectedMapping.transform}</small><strong>{selectedCalculation.transformed.toFixed(3)}</strong></span><i>→</i>
                      <span><small>{TARGET_BY_ID[selectedMapping.target].label}</small><strong>{selectedCalculation.output.toFixed(TARGET_BY_ID[selectedMapping.target].decimals)} {TARGET_BY_ID[selectedMapping.target].unit}</strong></span>
                    </div>
                  )}
                </section>

                <section className="analysis-timeline" aria-labelledby="analysis-timeline-title">
                  <div className="section-heading"><span>CAUSAL NARRATIVE</span><h3 id="analysis-timeline-title">{SIGNAL_BY_ID[selectedSignal].label} through the current run</h3></div>
                  <Timeline history={history} selectedSignal={selectedSignal} scenario={scenario} time={time} />
                </section>
              </div>
            ) : (
              <div className="audio-analysis">
                <section className="analyser-stage" aria-labelledby="analyser-title">
                  <div className="section-heading"><span>ACTUAL AUDIO OUTPUT</span><h3 id="analyser-title">Waveform and spectrum</h3></div>
                  <AudioScope analyser={analyser} active={audioEnabled} muted={audioMuted} />
                  <OutputMeter analyser={analyser} active={audioEnabled} muted={audioMuted} />
                  {!audioEnabled && !audioError && <p className="audio-boundary">Audio is inactive until deliberately enabled. The mapped sonic state remains available for inspection.</p>}
                  {audioError && <p className="audio-error"><strong>AUDIO ENGINE UNAVAILABLE</strong>{audioError}</p>}
                </section>

                <section className="synthesis-analysis" aria-labelledby="synthesis-title">
                  <div className="section-heading"><span>MAPPED SONIC STATE / {mappingVariant}</span><h3 id="synthesis-title">Synthesis parameters</h3></div>
                  <div className="parameter-analysis-list">
                    {TARGETS.map((target) => {
                      const mapping = mappings.find((candidate) => candidate.target === target.id && candidate.enabled);
                      const value = outputByTarget[target.id];
                      const progress = (value - target.min) / (target.max - target.min);
                      return <span key={target.id}><small>{target.label}<i>{mapping ? SIGNAL_BY_ID[mapping.source].label : "NEUTRAL DEFAULT"}</i></small><b><em style={{ width: `${Math.max(0, Math.min(100, progress * 100))}%` }} /></b><strong>{formatValue(value, target.decimals)} <i>{target.unit}</i></strong></span>;
                    })}
                  </div>
                  <div className="harmonic-analysis"><span><small>HARMONIC STATE</small><strong>{harmonicState}</strong></span><span><small>DEPLOY EVENT</small><strong>{frame.deployEvent ? "TRANSIENT FIRED" : "ARMED"}</strong></span><span><small>SAFETY STAGE</small><strong>POST-MASTER LIMITING</strong></span></div>
                </section>

                <section className="audio-field-analysis" aria-labelledby="mapped-field-title">
                  <div className="section-heading"><span>INTERPRETIVE VISUALISATION</span><h3 id="mapped-field-title">Mapped Spectral Field</h3></div>
                  <SpectralField frame={frame} outputs={outputByTarget} scenarioId={scenarioId} playback={playback} audioEnabled={audioEnabled} muted={audioMuted} selectedMapping={selectedMapping} soloRoute={soloRoute} variant={mappingVariant} compact />
                </section>
              </div>
            )}
          </section>
        )}
      </div>

      <footer className="spectral-footer" aria-live="polite">
        <span>{notice}</span>
        {!storageAvailable && <strong>LOCAL PRESET STORAGE UNAVAILABLE</strong>}
        <nav aria-label="Product context"><a href="https://atlas-systems.uk/lab/">LAB</a><a href="https://atlas-systems.uk/">ATLAS SYSTEMS</a><button onClick={() => setHelpOpen(true)}>KEYS / HELP</button></nav>
      </footer>

      {saveOpen && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setSaveOpen(false); }}>
          <form className="dialog" role="dialog" aria-modal="true" aria-labelledby="save-title" onSubmit={(event) => { event.preventDefault(); savePreset(); }}>
            <header><div><span>LOCAL PRESET / MAPPING {mappingVariant}</span><h2 id="save-title">Save current mapping</h2></div><button type="button" onClick={() => setSaveOpen(false)} aria-label="Close save preset dialog">×</button></header>
            <div className="dialog__body"><label><span>PRESET NAME</span><input autoFocus type="text" maxLength={36} value={presetName} onChange={(event) => setPresetName(event.target.value)} placeholder="e.g. QUEUE SIGNAL STUDY" /></label><p>Configuration only. Playback and audio activation are never stored.</p><div><button type="button" onClick={() => setSaveOpen(false)}>CANCEL</button><button className="dialog-primary" type="submit">SAVE PRESET</button></div></div>
          </form>
        </div>
      )}

      {resetOpen && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setResetOpen(false); }}>
          <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="reset-title">
            <header><div><span>MAPPING RESET</span><h2 id="reset-title">Restore Reference Map?</h2></div><button onClick={() => setResetOpen(false)} aria-label="Close reset confirmation">×</button></header>
            <div className="dialog__body"><p>This restores both A and B to the shipped Reference Map. Saved user presets remain available.</p><div><button onClick={() => setResetOpen(false)}>CANCEL</button><button className="dialog-danger" onClick={resetReference}>RESTORE REFERENCE</button></div></div>
          </section>
        </div>
      )}

      {helpOpen && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setHelpOpen(false); }}>
          <section className="dialog dialog--wide" role="dialog" aria-modal="true" aria-labelledby="help-title">
            <header><div><span>INSTRUMENT GUIDE</span><h2 id="help-title">How Spectral Forge works</h2></div><button onClick={() => setHelpOpen(false)} aria-label="Close help">×</button></header>
            <div className="dialog__body help-grid">
              <p>PLAY exposes the simulated system as a field and a sound. FORGE changes the deterministic translation. ANALYSE proves what changed through raw telemetry and actual post-master audio data.</p>
              <p>The Spectral Field is interpretive and driven by current mapped values. The analyser is separate and measures the actual Web Audio output.</p>
              <dl><div><dt>SPACE</dt><dd>Play / pause</dd></div><div><dt>R</dt><dd>Reset run</dd></div><div><dt>M</dt><dd>Mute / unmute</dd></div><div><dt>1–7</dt><dd>Select scenario</dd></div><div><dt>P</dt><dd>Open PLAY</dd></div><div><dt>F</dt><dd>Open FORGE</dd></div><div><dt>A</dt><dd>Open ANALYSE</dd></div><div><dt>?</dt><dd>Open this guide</dd></div></dl>
              <p className="dialog-evidence"><strong>SIMULATED</strong> Synthetic deterministic telemetry. No production Atlas Systems data, credentials or monitoring systems are connected.</p>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
