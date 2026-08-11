import { mountLabSound } from "../shared/lab-explore-sound.js?v=20260811-sound-v3";

const sound = mountLabSound({
  voice: "bearing",
  button: document.querySelector("#btn-sound"),
});

document.getElementById("btn-surge")?.addEventListener("click", () => {
  sound.cue("warn");
});
document.getElementById("btn-chaos")?.addEventListener("click", () => {
  sound.cue("mark");
});
document.getElementById("btn-rebuild")?.addEventListener("click", () => {
  sound.cue("clear");
});
