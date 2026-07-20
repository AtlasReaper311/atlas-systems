from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATCHER = ROOT / "scripts/apply_system_symphony_loop_production_v2.py"


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding="utf-8")


def normalize_patcher() -> str:
    text = PATCHER.read_text(encoding="utf-8")
    old_helper = '''def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)
'''
    new_helper = '''def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count > 1:
        raise RuntimeError(f"{label}: expected at most one match, found {count}")
    if count == 0:
        print(f"SKIP stale replacement: {label}")
        return text
    return text.replace(old, new, 1)
'''
    if old_helper not in text:
        raise RuntimeError("replace_once helper shape changed unexpectedly")
    text = text.replace(old_helper, new_helper, 1)
    lines = text.splitlines()

    def one(label: str) -> int:
        matches = [index for index, line in enumerate(lines) if label in line]
        if len(matches) != 1:
            raise RuntimeError(
                f"expected one patcher target for {label}, found {len(matches)}"
            )
        return matches[0]

    lines[one('"signature chord progression"')] = (
        "performance = replace_all(performance, "
        "'    chordOffset,\\n    bassPattern,', "
        "'    chordOffset,\\n    chordProgression,\\n    bassPattern,', "
        '"signature and return chord progression", minimum=2)'
    )
    lines[one('"return chord progression"')] = (
        "# chordProgression was inserted into both matching contexts above."
    )
    lines[one('"motif root retune"')] = (
        "# motif root is normalized against current source after patch application."
    )
    return "\n".join(lines) + "\n"


def apply_patcher() -> None:
    source = normalize_patcher()
    namespace = {
        "__name__": "__main__",
        "__file__": str(PATCHER),
    }
    exec(compile(source, str(PATCHER), "exec"), namespace)


def normalize_candidate() -> None:
    director_path = "static/js/sonify/composition-director.js"
    director = read(director_path)
    director = director.replace(
        'const root = plan.state === "unknown" ? 50 : 54;',
        'const root = plan.state === "unknown" ? 53 : 57;',
        1,
    )
    if 'const root = plan.state === "unknown" ? 53 : 57;' not in director:
        raise RuntimeError("F-centred motif root was not established")
    write(director_path, director)

    samples_path = "static/js/sonify/samples.js"
    samples = read(samples_path)
    samples = samples.replace(
        'warning: Object.freeze({ bassLoop: "neo-tokyo", lead: "acid-synth", atmosphere: "motherboard" }),',
        'warning: Object.freeze({ bassLoop: "neo-tokyo", lead: "acid-synth", atmosphere: "new-punks" }),',
    )
    samples = samples.replace(
        'critical: Object.freeze({ bassLoop: "distorted-guitar", lead: null, atmosphere: "nanotech" }),',
        'critical: Object.freeze({ bassLoop: "distorted-guitar", lead: null, atmosphere: "new-punks" }),',
    )
    samples = samples.replace(
        'unknown: Object.freeze({ bassLoop: null, lead: "geneticist", atmosphere: null }),',
        'unknown: Object.freeze({ bassLoop: null, lead: null, atmosphere: null }),',
    )
    live_policy = re.compile(
        r'  if \(performance\?\.liveDirected\) \{\n'
        r'(?:    .*\n)+?'
        r'  \}',
    )
    replacement = '''  if (performance?.liveDirected) {
    const fallback = LIVE_SAMPLE_FALLBACKS[state];
    palette.bassLoop = palette.bassLoop ?? fallback.bassLoop;
    palette.lead = fallback.lead;
    palette.atmosphere = fallback.atmosphere;
    palette.metal = "perc-stick";
  }'''
    samples, count = live_policy.subn(replacement, samples, count=1)
    if count != 1:
        raise RuntimeError(f"expected one live sample policy block, found {count}")
    write(samples_path, samples)

    engine_path = "static/js/sonify/engine.js"
    engine = read(engine_path)
    engine = engine.replace(
        'const depth = scoreState === "critical" ? 0.48 : scoreState === "warning" ? 0.54 : 0.6;',
        'const depth = scoreState === "critical" ? 0.62 : scoreState === "warning" ? 0.67 : 0.72;',
    )
    engine = engine.replace(
        'masterClipper = new Tone.Distortion({ distortion: 0.04, oversample: "2x", wet: 0.08 });',
        'masterClipper = new Tone.Distortion({ distortion: 0.04, oversample: "2x", wet: 0.03 });',
    )
    write(engine_path, engine)

    sampler_test_path = "static/js/sonify/sampler.test.js"
    sampler_test = read(sampler_test_path)
    old_atmosphere = '''      runtime.starts.some(({ name, args }) => name === "GrainPlayer" && args[0] === 3.5),
      "scheduled atmosphere starts must use the transport callback time",'''
    new_atmosphere = '''      runtime.starts.some(({ name, args }) => ["GrainPlayer", "Player"].includes(name) && args[0] === 3.5),
      "scheduled atmosphere starts must use the transport callback time regardless of player mode",'''
    if old_atmosphere in sampler_test:
        sampler_test = sampler_test.replace(old_atmosphere, new_atmosphere, 1)
    if new_atmosphere not in sampler_test:
        raise RuntimeError("scheduled atmosphere sampler assertion was not normalized")

    old_measure_restart = '''    assert.equal(
      sampler.playBassPhrase(0, frame, 8, 0, loopPerformance),
      true,
      "the selected four-beat fragment must restart on every measure boundary",
    );'''
    new_measure_restart = '''    assert.equal(
      sampler.playBassPhrase(0, frame, 8, 0, loopPerformance),
      false,
      "the selected four-bar loop must not restart on an internal measure boundary",
    );'''
    if old_measure_restart in sampler_test:
        sampler_test = sampler_test.replace(old_measure_restart, new_measure_restart, 1)
    if new_measure_restart not in sampler_test:
        raise RuntimeError("bass phrase restart assertion was not normalized")
    write(sampler_test_path, sampler_test)


if __name__ == "__main__":
    apply_patcher()
    normalize_candidate()
    print("System SYMPHONY loop production v2 candidate prepared")
