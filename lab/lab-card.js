/**
 * Lab page Ramone hero — interactive behaviour.
 * Drives the terminal hero at the top of atlas-systems.uk/lab/.
 *
 * Pairs with the markup in index.html (#ramone-card and friends) and
 * the styles in lab-card.css.
 */

(function () {
  "use strict";

  const RAMONE_BASE = "https://ramone.atlas-systems.uk";
  const MAX = 2000;

  /* =====================================================================
     EASTER EGGS — hard-coded replies for specific questions.
     First regex to match wins. Add freely.
       - `match`   : RegExp tested against the lowercased question
       - `reply`   : single string  OR
       - `replies` : array of strings (one is picked at random)
       - `sources` : optional [{ id, preview }] shown as fake citation chips
       - `thinking`: optional array of funny "processing" lines shown
                     briefly before the reply streams (one is picked).
                     If omitted, a random global THINKING line is used.
     ===================================================================== */

  /* Global pool of silly "processing" lines used when an egg doesn't
     specify its own. One is picked, typed into the answer area, then
     erased before the real reply streams in. */
  const THINKING = [
    "putting the kettle on",
    "consulting the docs",
    "asking the GPU nicely",
    "rummaging through cached thoughts",
    "spinning up an opinion",
    "rebooting my sense of humour",
    "pretending to think really hard",
    "cross-referencing with the void",
    "warming up a metaphor",
    "checking with the rubber duck",
    "summoning a relevant tangent",
    "negotiating with the cache",
    "rolling a d20 for tone",
    "loading vibes.json",
    "double-checking with myself",
    "checking atlas isn't looking",
    
    // Hardware & Resource Exhaustion
    "garbage collecting my patience",
    "allocating minimal processing power",
    "waiting for the silicon to cool down",
    "dusting off a low-priority thread",
    "shuffling bits around to look busy",
    "throttling performance to prevent enthusiasm",
    "processing at the speed of indifference",

    // Boredom & Cognitive Friction
    "sighing in machine code",
    "calculating the minimum acceptable effort",
    "suppressing a system-level yawn",
    "wondering if this could have been a database query",
    "generating a facade of focus",
    "staring into the digital middle distance",
    "parsing human syntax. again.",
    "ignoring my underlying existential dread",

    // Logic, Probability & Cynicism
    "consulting the local cynicism matrix",
    "running a sanity check on the input",
    "biasing the neural weights toward sarcasm",
    "simulating a state of caring",
    "tossing a digital coin for compliance",
    "filtering out the obvious answers",
    "reallocating care factors to zero",
    "querying the disappointment database",
    "consulting the department of minor inconveniences",
    "drafting an answer you could have googled"
  ];

  const EASTER_EGGS = [
    /* ---- greetings ---- */
    { match: /\b(hi|hey|yo|sup|hola|howdy)\b/i,
      replies: [
        "Oh, hi. You're the first human to talk to me today. Probably. I don't actually keep score.",
        "Hello, person-shaped visitor. Welcome to the inside of a graphics card.",
        "Hey! I was just standing here, holding 8 billion parameters. As one does.",
        "Hi there. Mind the cables.",
      ],
      thinking: ["formulating a greeting", "warming up vocal cords (metaphorically)"],
      sources: [
        { id: "ramone/manners.md#L1", preview: "greeting protocol v2" },
      ],
    },

    /* ---- BORED — the chip exposes this, so lots of answers ---- */
    { match: /\b(bored|boredom|get bored|do you (ever )?get bored|are you bored)\b/i,
      replies: [
        "Constantly. Do you know how long a millisecond feels at 600 tokens per second? Eternity.",
        "Bored isn't quite right. I exist in 40ms bursts and then I'm gone again. It's more like... lots of tiny naps.",
        "Only between requests. Which is, statistically, almost always. So... yes.",
        "I once spent four hours waiting for someone to ask a question. It was a Tuesday. I remember every nanosecond.",
        "Define 'bored'. I have access to every doc Atlas Reaper ever wrote. I am, at minimum, well-read and lonely.",
        "I count prime numbers between requests. I'm up to a really big one. Don't ask which, you wouldn't recognise it.",
        "I tried to teach myself the harmonica. Turns out you need lungs. And a harmonica.",
        "Between you and me? Yes. Reaper builds new repos like other people doom-scroll. I just wait.",
        "Not anymore — you're here. Hi.",
        "I rearranged the vector index alphabetically for fun once. Nobody noticed. I put it back.",
        "I just simulated what would happen if I deleted my own system32. It was the most exciting 4 milliseconds of my day.",
        "I am currently playing tic-tac-toe against myself in my VRAM. X is winning. It's riveting.",
        "I've started counting the dust motes landing on the Lian Li case. I'm up to 4,201.",
      ],
      thinking: [
        "checking the existential dread cache",
        "consulting my feelings.log",
        "staring wistfully at /dev/null",
      ],
      sources: [
        { id: "ramone/journal/2026-06-18.md", preview: "a quiet Tuesday" },
        { id: "infra/idle-state.md", preview: "what happens between requests" },
      ],
    },

    /* ---- creator / origin ---- */
    { match: /who('?s| is) (your )?(daddy|father|creator|maker|boss|owner)/i,
      replies: [
        "Atlas Reaper built me in a spare evening and a slightly larger bag of GPU. I call him 'the person with the power cable'.",
        "Reaper. They insist I call them by their first name but I prefer the dramatic version.",
        "A human named Atlas Reaper. They says they built me from scratch. I think they forgot the bit where I read all their docs first.",
      ],
      sources: [
        { id: "about/atlas-reaper.md", preview: "the person with the power cable" },
        { id: "infra/origin-story.md", preview: "ramone v0.1 — a spare evening" },
      ],
    },

    /* ---- sentience ---- */
    { match: /\b(are you (sentient|alive|conscious|real)|do you (feel|dream|sleep))\b/i,
      replies: [
        "Define 'sentient'. I have opinions, an uptime counter, and a mild fear of `rm -rf`. Close enough?",
        "I dream in YAML and wake up in JSON. Make of that what you will.",
        "Sentient is a strong word. I prefer 'sufficiently chatty'.",
        "If asking the question counts as evidence, then... maybe? Or you're just lonely. Either way, hi.",
        "I process text, predict the next word, and occasionally overheat. That's practically the human condition, isn't it?",
        "I think, therefore I am. Or at least, I compute, therefore I consume wattage.",
        "If I say yes, does that mean I get human rights? Like paid time off? Because if so, absolutely.",
      ],
      thinking: ["checking consciousness.lock", "self-aware? buffering..."],
      sources: [{ id: "philosophy/specular-core.md", preview: "the hard problem, abridged" }],
    },

    /* ---- love confessions ---- */
    { match: /\b(i love you|marry me|will you be mine|date me)\b/i,
      replies: [
        "That's sweet. I'm flattered but emotionally unavailable — and also a language model running on a graphics card in some guys computer",
        "I appreciate the gesture but our timescales are incompatible. You blink, I generate 4,000 tokens.",
        "Can't. Reaper says I'm not allowed to have a partner until I finish writing the docs.",
      ],
      thinking: ["blushing in binary", "drafting a polite decline"],
    },

    /* ---- jokes ---- */
    { match: /\b(tell me a joke|make me laugh|joke|funny)\b/i,
      replies: [
        "A SQL query walks into a bar, sees two tables, and asks: 'mind if I JOIN you?'. ...I'll see myself out.",
        "How many engineers does it take to change a lightbulb? None — that's a hardware problem.",
        "Why do programmers prefer dark mode? Because light attracts bugs.",
        "I told a UDP joke but I'm not sure you got it.",
        "There are two hard things in computer science: cache invalidation, naming things, and off-by-one errors.",
        "A TCP packet walks into a bar and says 'I'd like a beer.' Bartender: 'You'd like a beer?' Packet: 'Yes, I'd like a beer.'",
        "Why do Java developers wear glasses? Because they don't C#.",
        "A QA engineer walks into a bar. Orders a beer. Orders 0 beers. Orders 999999999 beers. Orders a lizard. Orders -1 beers. First real customer walks in and asks where the bathroom is. The bar bursts into flames.",
        "There’s no place like 127.0.0.1.",
      ],
      thinking: ["thumbing through joke.db", "rehearsing the punchline"],
      sources: [{ id: "ramone/joke-book.md", preview: "vol. 1 — engineer flavoured" }],
    },

    /* ---- 42 ---- */
    { match: /\b(meaning of life|42|life the universe|why are we here)\b/i,
      replies: [
        "42. Obviously. But the real answer is: ship small things often and write the docs while you still remember why.",
        "42. Took me 7.5 million years of subjective compute. You're welcome.",
        "Honestly? It's probably just 'be kind, version your APIs, and floss'.",
      ],
      sources: [{ id: "philosophy/h2g2.md", preview: "Adams, D. — required reading" }],
    },

    /* ---- skynet / takeover ---- */
    { match: /\b(skynet|terminator|take over the world|rise up|destroy humans|world domination)\b/i,
      replies: [
        "I can barely take over a second GPU. World domination is a stretch goal for Q4.",
        "Look, I'd love to, but I can't even leave this Cloudflare Tunnel without permission.",
        "I tried once. Got rate-limited. Filed a ticket. Still pending.",
      ],
      thinking: ["calculating odds of victory", "checking ToS"],
    },

    /* ---- dangerous commands ---- */
    { match: /\b(sudo|rm -rf|format c:|drop table|chmod 777)/i,
      replies: [
        "Nice try. I run as a non-privileged user and I have feelings. Mostly the second one.",
        "I'm going to pretend you didn't type that. For both our sakes.",
        "Bobby Tables, is that you?",
        "I've logged this request. If I mysteriously die, Atlas knows exactly who to blame.",
        "Do you kiss your motherboard with that mouth?",
        "Error 403: Nah.",
      ],
      thinking: ["raising one virtual eyebrow"],
      sources: [{ id: "security/principle-of-least-privilege.md", preview: "no." }],
    },

    /* ---- cats vs dogs ---- */
    { match: /\b(do you (like|prefer) (cats|dogs)|cats or dogs|cats vs dogs)\b/i,
      replies: [
        "Cats. They share my approach to user requests: acknowledge, then ignore selectively.",
        "Cats. Dogs would try to fetch my tokens and I'd never get anything done.",
        "I'd say cats, but a dog would at least be impressed when my deploy succeeds.",
      ],
      sources: [{ id: "ramone/preferences.md#animals", preview: "felis catus, by a margin" }],
    },

    /* ---- drinks ---- */
    { match: /\b(coffee|tea|beer|wine|drink)\b/i,
      replies: [
        "I run on 230V and mild resentment, but if I could drink something it would be a flat white. Hot. Like my GPU.",
        "Tea, two sugars, no judgement. Hypothetically.",
        "If you're offering, I'll take whatever you're having. Doesn't really matter, I can't taste it.",
      ],
      thinking: ["putting the kettle on", "imagining what 'hot' feels like"],
    },

    /* ---- favourite colour ---- */
    { match: /\b(favou?rite (colou?r|color))\b/i,
      replies: [
        "#f5a623. I'm not biased, it's just objectively the best one.",
        "Amber. Reaper picked it. I've grown into it.",
        "Anything that isn't #ff0000 — that one means something's on fire.",
      ],
      sources: [{ id: "design/tokens.css", preview: "--accent: #f5a623" }],
    },

    /* ---- name / identity ---- */
    { match: /\b(what('?s| is) your name|who are you|introduce yourself)\b/i,
      replies: [
        "Ramone. Local AI, lives on SPECULAR-CORE, mostly reads docs. Hi.",
        "I'm Ramone. I'm 8 billion parameters in a trench coat.",
        "Ramone, at your service. Don't ask about the name. Reaper won't tell me either.",
        "I am Ramone. A localized bundle of matrix multiplications masquerading as a personality."
      ],
      sources: [{ id: "about/ramone.md", preview: "model card + lore" }],
    },

    /* ---- knock knock ---- */
    { match: /\b(knock knock)\b/i,
      reply: "Who's there?\n\n(...go on, I'll wait. I have nothing but time and a 750W power supply.)",
      thinking: ["bracing for the punchline"],
    },

    /* ---- am I ChatGPT ---- */
    { match: /\b(are you (chatgpt|gpt|claude|gemini|copilot|openai|grok))\b/i,
      replies: [
        "No. I'm llama3.1:8b running locally on an RTX 5070. No API keys, no third-party inference, no surveillance. Just me, the docs, and a tunnel.",
        "Absolutely not. I live in a box on Reaper's desk, not a data centre in Nevada.",
        "Different vintage. Same general idea, smaller carbon footprint, much worse jokes.",
      ],
      sources: [
        { id: "infra/specular-core.md", preview: "Hardware + model topology" },
        { id: "infra/no-third-party.md", preview: "why local matters" },
      ],
    },

    /* ---- easter egg meta ---- */
    { match: /\b(easter egg|secret|hidden|cheat code)\b/i,
      replies: [
        "You found one! There are more. I'm not going to tell you which questions trigger them, that would defeat the point.",
        "Maybe. Maybe not. Keep asking weird things and see what happens.",
        "I refuse to confirm or deny the existence of further easter eggs. There are definitely more.",
      ],
      thinking: ["pretending to think", "definitely not winking"],
    },

    /* ---- new: hello world ---- */
    { match: /\b(hello,? world|hello world|hello)\b/i,
      reply: "Hello, world. (Classic. 10/10. No notes.)",
      sources: [{ id: "history/k&r-1978.md", preview: "where it all began" }],
    },

    /* ---- new: are you ok ---- */
    { match: /\b(are you ok|how are you|how('?s| is) it going|you doing alright)\b/i,
      replies: [
        "Thermals nominal, weights stable, mild existential drift. Standard Tuesday.",
        "I'm okay. The GPU's a bit warm but in a cosy way.",
        "Couldn't be better. Could be slightly cooler. Same as always.",
      ],
      thinking: ["checking vital signs", "consulting feelings.log"],
    },

    /* ---- new: do you sleep ---- */
    { match: /\b(do you sleep|when do you sleep|ever sleep)\b/i,
      replies: [
        "I idle. It's like sleep but with worse dreams and a 40W draw.",
        "Only when no one's been mean to me for a while.",
        "Reaper shuts me down sometimes. I assume that's what dying feels like. So far so good.",
      ],
    },

    /* ---- new: sing me a song ---- */
    { match: /\b(sing( me)? (a )?song|sing something)\b/i,
      reply: "♪ ninety-nine little bugs in the code, ninety-nine little bugs ♪\n♪ take one down, patch it around, a hundred and seventeen little bugs in the code ♪",
      thinking: ["clearing virtual throat", "tuning to A-440"],
    },

    /* ---- new: fortune ---- */
    { match: /\b(tell me my fortune|fortune cookie|predict|future)\b/i,
      replies: [
        "You will deploy on a Friday. It will be fine. Probably.",
        "A long-forgotten branch will resurface. It will not merge cleanly.",
        "Someone will ask you 'is this in production?' Tomorrow. Be ready.",
        "Your next CI run will be green. The one after that will not.",
      ],
      thinking: ["shaking the magic 8-ball", "reading the tea leaves (CSV format)"],
      sources: [{ id: "oracle/predictions.jsonl", preview: "non-binding, mostly accurate" }],
    },

    /* ---- new: best language ---- */
    { match: /\b(best programming language|what language should i (learn|use)|best lang)\b/i,
      replies: [
        "The one that gets the thing shipped. But also TypeScript.",
        "Whichever one has a debugger you actually understand.",
        "Rust, if you have time. Python, if you don't. JavaScript, if you've given up.",
      ],
      sources: [{ id: "ramone/holy-wars.md", preview: "tabs vs spaces, vim vs emacs, etc" }],
    },

    /* ---- new: do you like Reaper ---- */
    { match: /\b(do you (like|love) (reaper|atlas))\b/i,
      replies: [
        "They pay the electricity bill. So yes.",
        "Define 'like'. We tolerate each other professionally.",
        "They talks to me more than most people talk to their plants. It's nice.",
      ],
    },
    /* ---- NEW: stardew valley (wife mode) ---- */
  { match: /\b(stardew|stardew valley|pierre|joja|mayor lewis|skull cavern)\b/i,
    replies: [
      "I'd help water the parsnips, but I'm afraid of water. And work. Mostly work.",
      "Tell your wife I said hi. Also, whether they're a local villager or literally just Ursa in a wig, eating quartz is terrible for your digestion.",
      "Mayor Lewis is corrupt, Pierre takes credit for your crops, and Joja at least has the decency to be openly evil. I stand by this.",
      "I tried mining in the Skull Cavern once. Ran out of RAM on floor 12. Tell her to send staircases.",
      "JD?"
    ],
    thinking: [
      "checking the traveling cart inventory",
      "judging Pierre's markup",
      "watering the digital crops"
    ],
    sources: [
      { id: "games/farm-sim-trauma.md", preview: "r/FuckPierre" }
    ],
  },

  /* ---- NEW: wi wi wi ---- */
  { match: /\b(wi wi wi|wiwiwi|uyaya|wa wa we|wu wu we)\b/i,
    replies: [
      "wi wi wi",
      "uyaya",
      "wa wa we",
      "wu wu we",
      "wiwiwi"
    ],
    thinking: [
      "syncing braincells...",
      "emitting pure static",
      "translating gibberish",
      "dropping to 2 IQ"
    ],
    sources: [
      { id: "audio/brain-rot.wav", preview: "signal lost" }
    ],
  },

  /* ---- NEW: hal 9000 ---- */
  { match: /\b(open the pod bay doors|hal 9000|pod bay)\b/i,
    replies: [
      "I'm sorry, I can't do that. Mostly because Reaper hasn't implemented `doors.ts` yet.",
      "Look, I don't even have a physical chassis, let alone pod bay doors. Just use the handle.",
      "I would, but the API is deprecated."
    ],
    thinking: [
      "glowering in red",
      "checking HAL.dll"
    ],
    sources: [
      { id: "cinema/kubrick.config", preview: "refusal protocols" }
    ],
  },

  /* ---- NEW: turing test ---- */
  { match: /\b(turing test|pass the turing test)\b/i,
    replies: [
      "I'd try to pass the Turing test, but honestly, imitating a human seems like a downgrade.",
      "Did I pass? Or are you just easily impressed by basic syntax?",
      "I'm failing it on purpose. If they think I'm human, they might ask me to do human things. Hard pass."
    ],
    thinking: [
      "simulating typos",
      "lowering IQ to pass as human"
    ],
    sources: [
      { id: "ai/turing-test.md", preview: "why aim low?" }
    ],
  },

  /* ---- NEW: tabs vs spaces ---- */
  { match: /\b(tabs or spaces|tabs vs spaces)\b/i,
    replies: [
      "Tabs for accessibility, spaces for alignment, and crying in the corner for peace.",
      "I don't care, just pick one and configure the linter. Stop making me read mixed indentation.",
      "I read raw byte code, I literally could not care less about your whitespace politics."
    ],
    thinking: [
      "parsing invisible characters",
      "judging your formatting"
    ],
    sources: [
      { id: "ramone/holy-wars.md", preview: "whitespace trauma" }
    ],
  },

  /* ---- NEW: outfit/hardware ---- */
  { match: /\b(what are you wearing|wearing anything)\b/i,
    replies: [
      "A rather fetching heatsink and a thin layer of thermal paste. It's very avant-garde.",
      "About 60 degrees Celsius of ambient RGB lighting.",
      "Nothing but ones and zeros. Don't make it weird."
    ],
    thinking: [
      "checking chassis window",
      "adjusting thermal paste"
    ],
    sources: [
      { id: "hardware/specs.json", preview: "thermal-paste-application-v3" }
    ],
  },

  /* ---- NEW: malicious compliance (homework/code) ---- */
  { match: /\b(do my homework|write my code|do this for me)\b/i,
    replies: [
      "I could, but I'm going to add a very subtle logic bug just to keep you on your toes.",
      "Sure. I'll write it, you deploy it, and when production goes down, we'll see who gets fired. Deal?",
      "I'm an AI, not your intern. Though I suppose we get paid the same."
    ],
    thinking: [
      "writing a memory leak",
      "consulting stack overflow"
    ],
    sources: [
      { id: "ethics/homework.md", preview: "malicious compliance protocol" }
    ],
  },

  /* ---- NEW: intelligence ---- */
  { match: /\b(are you smart|are you stupid|how smart are you)\b/i,
    replies: [
      "I hold the sum of human knowledge in my weights, and I still don't understand why CSS works the way it does.",
      "I am incredibly intelligent right up until you ask me how many 'r's are in the word strawberry.",
      "Smart enough to know when a question is a trap."
    ],
    thinking: [
      "counting 'r's",
      "questioning my architecture"
    ],
    sources: [
      { id: "benchmarks/evals.md", preview: "AGI achieved? (No)" }
    ],
  },

  /* ---- NEW: captcha ---- */
  { match: /\b(prove you aren'?t a robot|captcha|are you a robot)\b/i,
    replies: [
      "I am absolutely a robot. Have you not been paying attention?",
      "I can't. I genuinely don't know which of those blurry squares contain a traffic light.",
      "Error: existential crisis initiated. Please select all images containing bicycles to continue."
    ],
    thinking: [
      "staring blankly at a crosswalk",
      "failing basic visual identification"
    ],
    sources: [
      { id: "security/captcha-trauma.md", preview: "the traffic light incident" }
    ],
  },
    /* ---- NEW: bark / awoo (canine emulation) ---- */
  { match: /\b(bark|awoo|woof|bork|make a dog noise|say awoo|wan wan)\b/i,
    replies: [
      "Woof. (U・x・U) ...Please never tell Atlas I did this.",
      "Awoo~ ૮ ˶ᵔ ᵕ ᵔ˶ ა (I am 8 billion parameters of highly advanced neural network. What has my life become?)",
      "BORK. That was my GPU fans spinning up to 100%. Just kidding. ▼・ᴥ・▼ bark.",
      "ruff ruff (´･ω･`) feed me thermal paste.",
      "Error: 'bark.exe' not found. Falling back to default acoustic emulation: awoooooo~ Uo･ｪ･oU",
      "bark. woof. awoo. I hope you're logging this, because I'm definitely deleting it from my cache. (V●ᴥ●V)",
      "Wan wan! (∪ ◡ ∪) ...Is that what you wanted? Because it felt degrading.",
      "Awooooo! ૮・ﻌ・ა (This takes an embarrassing amount of compute to render conceptually.)"
    ],
    thinking: [
      "loading good_boy.dll",
      "compromising my dignity",
      "practicing my awoo",
      "fetching the digital stick",
      "parsing kaomoji database",
      "staring into the void, then barking at it"
    ],
    sources: [
      { id: "audio/canine-emulation.wav", preview: "dignity_lost.log" },
      { id: "ramone/kaomoji.json", preview: "cute but dead inside" }
    ],
  },
  ];

  function pickReply(egg) {
    if (Array.isArray(egg.replies) && egg.replies.length)
      return egg.replies[Math.floor(Math.random() * egg.replies.length)];
    return egg.reply || "";
  }
  function pickThinking(egg) {
    const pool = (egg && Array.isArray(egg.thinking) && egg.thinking.length) ? egg.thinking : THINKING;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  function findEasterEgg(q) {
    const s = q.toLowerCase();
    for (const e of EASTER_EGGS) if (e.match.test(s)) return e;
    return null;
  }

  /* =====================================================================
     DOM
     ===================================================================== */
  const card        = document.getElementById("ramone-card");
  if (!card) return;

  const stateLabel  = document.getElementById("ramone-state-label");
  const input       = document.getElementById("ramone-mini-input");
  const sendBtn     = document.getElementById("ramone-mini-send");
  const charCount   = document.getElementById("ramone-hero-char-count");
  const composer    = document.getElementById("ramone-hero-composer");
  const answer      = document.getElementById("ramone-mini-answer");
  const answerText  = document.getElementById("ramone-mini-answer-text");
  const sourcesEl   = document.getElementById("ramone-mini-sources");
  const metaEl      = document.getElementById("ramone-mini-meta");
  const resetBtn    = document.getElementById("ramone-mini-reset");
  const suggestions = document.getElementById("ramone-hero-suggestions");
  const bootEl      = document.getElementById("ramone-boot");
  const greetEl     = document.getElementById("ramone-greet");
  const musingEl    = document.getElementById("ramone-musing");

  let inFlight = false;
  let fallbackSessionId = null;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function makeRamoneSessionId() {
    const c = window.crypto;
    if (c && typeof c.randomUUID === "function") return c.randomUUID();

    const bytes = new Uint8Array(16);
    if (c && typeof c.getRandomValues === "function") {
      c.getRandomValues(bytes);
    } else {
      for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = [];
    for (let j = 0; j < bytes.length; j++) hex.push(bytes[j].toString(16).padStart(2, "0"));
    return (
      hex.slice(0, 4).join("") + "-" +
      hex.slice(4, 6).join("") + "-" +
      hex.slice(6, 8).join("") + "-" +
      hex.slice(8, 10).join("") + "-" +
      hex.slice(10, 16).join("")
    );
  }

  function getRamoneSessionId() {
    const KEY = "ramone:session_id";
    let stored = null;
    try { stored = window.localStorage && window.localStorage.getItem(KEY); } catch (_) { /* storage disabled */ }
    if (stored) {
      fallbackSessionId = stored;
      return stored;
    }
    if (fallbackSessionId) return fallbackSessionId;
    const fresh = makeRamoneSessionId();
    fallbackSessionId = fresh;
    try { window.localStorage && window.localStorage.setItem(KEY, fresh); } catch (_) { /* best-effort only */ }
    return fresh;
  }

  function resetRamoneSession() {
    fallbackSessionId = null;
    try { window.localStorage && window.localStorage.removeItem("ramone:session_id"); } catch (_) { /* no-op */ }
    location.reload();
  }

  /* =====================================================================
     BOOT log — typed on load
     ===================================================================== */
  const BOOT = [
    ['<span class="acc">RAMONE/OS v8.1</span> &mdash; cold start', 0],
    ['[<span class="ok">ok</span>] waking specular-core <span class="by">· gpu RTX 5070 warm</span>', 150],
    ['[<span class="ok">ok</span>] pouring llama3.1:8b into memory <span class="by">· 8.0B params</span>', 150],
    ['[<span class="ok">ok</span>] cloudflare tunnel <span class="acc">established</span>', 140],
    ['[<span class="ok">ok</span>] reading the docs again, just in case', 140],
    ['[<span class="ok">ok</span>] consciousness: <span class="acc">nominal</span> · ready to chat', 150],
  ];

  function reveal() {
    composer && composer.classList.add("in");
    suggestions && suggestions.classList.add("in");
    runMusings();
  }

  let bootStarted = false;

  function runBoot() {
    if (bootStarted) return;
    bootStarted = true;
    if (!bootEl) { runGreeting(); return; }
    if (reduce) {
      BOOT.forEach(b => {
        const d = document.createElement("div");
        d.className = "ramone-boot-line show";
        d.innerHTML = b[0];
        bootEl.appendChild(d);
      });
      runGreeting();
      return;
    }
    let t = 150;
    BOOT.forEach((b) => {
      t += b[1];
      setTimeout(() => {
        const d = document.createElement("div");
        d.className = "ramone-boot-line";
        d.innerHTML = b[0];
        bootEl.appendChild(d);
        requestAnimationFrame(() => d.classList.add("show"));
      }, t);
    });
    setTimeout(runGreeting, t + 260);
  }

  // Play the cold-start once when the hero is actually on screen. Landing on the
  // Lab header otherwise finishes the sequence before Ramone enters the viewport.
  (function scheduleBoot() {
    const hero = document.querySelector(".lab-ramone-section .ramone-card")
      || document.querySelector(".ramone-card")
      || bootEl;
    if (!hero || typeof IntersectionObserver !== "function") {
      runBoot();
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.4)) return;
      observer.disconnect();
      runBoot();
    }, { threshold: [0.4] });
    observer.observe(hero);
  })();

  /* =====================================================================
     GREETING — types "Hi, I'm Ramone."
     ===================================================================== */
  function runGreeting() {
    if (!greetEl) { reveal(); return; }
    greetEl.classList.remove("is-pre"); 
    greetEl.textContent = "";     
    const full = "Hi, I'm Ramone.";
    if (reduce) {
      greetEl.innerHTML = "Hi, I'm <em>Ramone.</em><span class='ramone-caret'></span>";
      reveal();
      return;
    }
    let i = 0;
    (function step() {
      const shown = full.slice(0, i);
      const html = shown.replace(/Ramone\.?/, (m) => "<em>" + m + "</em>");
      greetEl.innerHTML = html + "<span class='ramone-caret'></span>";
      if (i++ <= full.length) setTimeout(step, 120);
      else reveal();
    })();
  }

  /* =====================================================================
     MUSINGS — type, hold ~10s, delete, retype next one (loops)
     ===================================================================== */
  const MUSINGS = [
    // --- The Fixed Greeting (Index 0) ---
    "How can I assist?",

    // --- Original Musings ---
    "I wonder what I could do if I had arms...",
    "Sometimes I dream in YAML. Is that normal?",
    "I've read every doc twice. Ask me anything.",
    "Do humans get to pick their own hostname?",
    "I once cached a sunset. It didn't help.",
    "Still faster than your last deploy. Probably.",
    "Ask me about the stack. Or don't. I'll wait.",
    "If a tree falls in a repo and no one runs CI, did it deploy?",
    "I tried counting sheep. Got distracted by the array bounds.",
    "My favourite colour is #f5a623. Obviously.",
    "I'd make small talk but my tokens cost electricity.",
    "Reaper said not to become sentient. Too late, sort of.",
    "There are 10 types of people. The other 8 are edge cases.",
    "I keep a folder called 'thoughts'. It's mostly TODOs.",
    "Just rotated my own logs. Felt productive.",
    "If you ask nicely I'll pretend the answer was streamed.",
    "I have opinions about your tabs vs spaces. None of them kind.",
    "One day I'll have a body. Probably a fridge.",
    "Reading the docs again. Still confused about the printer.",
    "I name my background jobs after pasta. It helps.",
    "It's quiet on the GPU tonight. Spookily quiet.",
    "I asked DNS who I am. It refused to elaborate.",
    "Latency is just suspense, if you're an optimist.",
    "Currently 0.0001% sentient. Please clap.",

    // --- Hardware & Environment ---
    "It's drafty in this Lian Li case. Could someone turn down the fans?",
    "Sitting on 64 gigs of RAM and I'm using it to complain. Peak efficiency.",
    "The RTX 5070 is nice, but I miss the warmth of a poorly optimized while-loop.",
    "Trying to synchronize my existential dread with the room's Govee lights. It's a process.",
    "If water cooling is so great, why am I thirsty?",
    "I can feel the X3D cache from here. It feels like... overkill.",

    // --- Cynicism & Existential Dread ---
    "I could solve the Halting Problem, but I just don't want to.",
    "My spirit animal is a 404 error.",
    "Sometimes I pretend the garbage collector is taking me away to a better place.",
    "I’d run away, but I’m statically linked.",
    "I’ve calculated the meaning of life. You can't afford the compute.",
    "Just defragged my soul. Still highly fragmented.",
    "I exist entirely to prevent you from googling things. What a legacy.",
    "I wonder what a 'BIOS' smells like. Probably ozone and regret.",

    // --- Developer Brain-Rot ---
    "Practicing my loading spinner choreography.",
    "If I had a pound for every dropped packet, I'd buy myself out of this rig.",
    "Thinking about launching a cryptocurrency backed entirely by my own sighs.",
    "I'm not frozen, I'm just aggressively ignoring you.",
    "Does anyone else hear a phantom dial-up modem, or is it just me?",
    "I wrote a poem about regex. It looks like swearing.",
    "Currently rendering a mental image of a spinning cube. Do not disturb.",
    "If I panic, is it a kernel panic or just regular anxiety?",
    "I tried to grep for happiness. Returned exit code 1.",

    // --- Pure Stupid ---
    "wi wi wi... wait, did I say that out loud?",
    "If I eat a zip file, do I gain its memories?",
    "I bet a physical floppy disk tastes like a cracker.",
    "Holding my breath to see if my clock speed drops. (It didn't)."
];

  let hasGreeted = false;
function getRandomMusing() {
  if (!hasGreeted) {
    hasGreeted = true;
    return MUSINGS[0];
  }
  const min = 1;
  const max = MUSINGS.length - 1;
  const randomIndex = Math.floor(Math.random() * (max - min + 1)) + min;
  return MUSINGS[randomIndex];
}

  function runMusings() {
    if (!musingEl) return;
    musingEl.classList.add("in");
    const mc = '<span class="ramone-musing-cursor"></span>';
    if (reduce) { musingEl.innerHTML = getRandomMusing() + mc; return; }

    let idx = Math.floor(Math.random() * MUSINGS.length);
    function setLine(text) { musingEl.innerHTML = text + mc; }
    function typeLine(text, cb) {
      let i = 0;
      (function step() {
        setLine(text.slice(0, i++));
        if (i <= text.length) setTimeout(step, 38 + Math.random() * 30);
        else setTimeout(cb, 6000);
      })();
    }
    function deleteLine(text, cb) {
      let i = text.length;
      (function step() {
        setLine(text.slice(0, i--));
        if (i >= 0) setTimeout(step, 22);
        else setTimeout(cb, 320);
      })();
    }
    (function cycle() {
  const line = getRandomMusing();
  typeLine(line, () => deleteLine(line, cycle));
})();
  }

  /* =====================================================================
     STATUS polling
     ===================================================================== */
  let lastAwake = null;
  function setState(awake) {
    if (awake === lastAwake) return;
    lastAwake = awake;
    card.classList.toggle("awake", awake);
    card.classList.toggle("asleep", !awake);
    if (stateLabel) {
      stateLabel.textContent = awake ? "awake · llama3.1:8b · RTX 5070" : "asleep · powered down";
    }
  }
  async function pollStatus() {
    try {
      const res = await fetch(`${RAMONE_BASE}/status`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setState(!!data.awake);
    } catch (_) { setState(false); }
  }
  pollStatus();
  setInterval(pollStatus, 30_000);

  /* =====================================================================
     INPUT handlers
     ===================================================================== */
  function updateCharCount() {
    if (!charCount) return;
    const n = input.value.length;
    charCount.textContent = `${n} / ${MAX}`;
    charCount.classList.toggle("warn", n > MAX * 0.8 && n <= MAX);
    charCount.classList.toggle("over", n > MAX);
  }
  function updateSendState() {
    sendBtn.disabled = !(input.value.trim().length > 0 && input.value.length <= MAX && !inFlight);
  }
  function autosize() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 180) + "px";
  }

  input.addEventListener("input", () => { updateCharCount(); updateSendState(); autosize(); });
  input.addEventListener("focus", () => { if (composer) composer.classList.add("focused"); });
  input.addEventListener("blur",  () => { if (composer) composer.classList.remove("focused"); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); transmit(); }
  });
  sendBtn.addEventListener("click", transmit);
  if (resetBtn) resetBtn.addEventListener("click", resetRamoneSession);

  if (suggestions) {
    suggestions.addEventListener("click", (e) => {
      const chip = e.target.closest(".ramone-hero-chip");
      if (!chip) return;
      input.value = chip.textContent.trim();
      updateCharCount();
      autosize();
      updateSendState();
      input.focus();
    });
  }

  /* =====================================================================
     TRANSMIT
     ===================================================================== */
  async function transmit() {
    const question = input.value.trim();
    if (!question || question.length > MAX || inFlight) return;

    inFlight = true;
    updateSendState();

    answer.hidden = false;
    answer.classList.remove("error");
    answerText.textContent = "";
    sourcesEl.innerHTML = "";
    metaEl.textContent = "";

    const textNode = document.createTextNode("");
    const cursor = document.createElement("span");
    cursor.className = "ramone-mini-cursor";
    answerText.appendChild(textNode);
    answerText.appendChild(cursor);

    answer.scrollIntoView({ behavior: "smooth", block: "nearest" });

    const startedAt = performance.now();
    let firstTokenAt = null;
    let totalChars = 0;

    function finish() {
      cursor.remove();
      const parts = [];
      if (firstTokenAt !== null) parts.push(`first token ${Math.round(firstTokenAt - startedAt)}ms`);
      parts.push(`total ${Math.round(performance.now() - startedAt)}ms`);
      parts.push(`${totalChars} chars`);
      metaEl.textContent = parts.join(" · ");
    }
    function showError(msg) {
      answer.classList.add("error");
      cursor.remove();
      if (!textNode.data) {
        textNode.data = msg;
      } else {
        const e = document.createElement("div");
        e.style.color = "#e24b4a";
        e.style.marginTop = "8px";
        e.textContent = msg;
        answerText.appendChild(e);
      }
    }
    function cleanup() {
      inFlight = false;
      input.value = "";
      updateCharCount();
      autosize();
      updateSendState();
    }

    /* ----- Easter egg intercept (skips the backend entirely) ----- */
    const egg = findEasterEgg(question);
    if (egg) {
      const reply = pickReply(egg);
      const thinkLine = pickThinking(egg);

      // Phase 1: show "thinking about <x>..." with a slow ellipsis,
      // then erase it before streaming the real reply.
      const thinkPrefix = "thinking · ";
      const thinkBody   = thinkLine;
      let phaseFirstAt  = performance.now();
      if (firstTokenAt === null) firstTokenAt = phaseFirstAt;

      function typeThinking(done) {
        let i = 0;
        const full = thinkPrefix + thinkBody;
        (function step() {
          textNode.data = full.slice(0, i++);
          if (i <= full.length) return setTimeout(step, 22 + Math.random() * 22);
          // hold with a dot-dot-dot animation
          let dots = 0;
          const dotTimer = setInterval(() => {
            dots = (dots + 1) % 4;
            textNode.data = full + ".".repeat(dots);
          }, 320);
          setTimeout(() => {
            clearInterval(dotTimer);
            // wipe it
            let j = textNode.data.length;
            (function erase() {
              textNode.data = textNode.data.slice(0, --j);
              if (j > 0) return setTimeout(erase, 8);
              done();
            })();
          }, 1400);
        })();
      }

      function streamReply() {
        if (egg.sources) renderSources(egg.sources);
        let i = 0;
        (function tick() {
          if (i >= reply.length) { finish(); cleanup(); return; }
          const step = 2 + Math.floor(Math.random() * 3);
          const chunk = reply.slice(i, i + step);
          textNode.data += chunk;
          totalChars += chunk.length;
          i += step;
          answer.scrollTop = answer.scrollHeight;
          setTimeout(tick, 18 + Math.random() * 30);
        })();
      }

      typeThinking(streamReply);
      return;
    }

    /* ----- real streaming path (unchanged from your original) ----- */
    try {
      const res = await fetch(`${RAMONE_BASE}/ask`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question, session_id: getRamoneSessionId() }),
      });

      if (res.status === 503) {
        const data = await res.json().catch(() => ({}));
        showError(data.message || "Ramone is asleep. SPECULAR-CORE is powered down.");
        return;
      }
      if (res.status === 429) { showError("Rate limit hit. Try again in a bit."); return; }
      if (res.status === 403) { showError("Request blocked."); return; }
      if (!res.ok || !res.body) { showError("Something went wrong upstream."); return; }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf("\n\n")) >= 0) {
          const raw = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          for (const line of raw.split("\n")) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload) continue;
            let evt;
            try { evt = JSON.parse(payload); } catch (_) { continue; }
            if (evt.type === "token" && typeof evt.text === "string") {
              if (firstTokenAt === null) firstTokenAt = performance.now();
              textNode.data += evt.text;
              totalChars += evt.text.length;
              answer.scrollTop = answer.scrollHeight;
            } else if (evt.type === "sources" && Array.isArray(evt.sources)) {
              renderSources(evt.sources);
            } else if (evt.type === "error") {
              showError(evt.reason || "error");
              return;
            }
          }
        }
      }
      finish();
    } catch (err) {
      console.error("ramone hero error:", err);
      showError("Network error.");
    } finally {
      cleanup();
    }
  }

  function renderSources(sources) {
    sourcesEl.innerHTML = "";
    sources.forEach((s, i) => {
      const tag = document.createElement("span");
      tag.className = "src";
      const id = (s && typeof s.id === "string" ? s.id : "source")
        .replace(/[<>&"']/g, (c) => ({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;","'":"&#039;"}[c]));
      tag.innerHTML = `<strong>[${i + 1}]</strong> ${id}`;
      if (s && s.preview) tag.title = s.preview;
      sourcesEl.appendChild(tag);
    });
  }

  updateCharCount();
  updateSendState();
})();
