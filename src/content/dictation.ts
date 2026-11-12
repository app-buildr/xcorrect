// Dictée vocale. La reconnaissance tourne sur l'appareil, avec le modèle
// embarqué du navigateur (Web Speech API, processLocally) : l'audio ne quitte
// pas la machine. Seul le texte retranscrit part ensuite à la correction, comme
// un brouillon tapé au clavier.
import { joinTranscript } from "../shared/text.ts";
import { appendText, failureNote } from "./editor.ts";
import { findEditor } from "./toolbar.ts";
import { finish, openLiveTip, rescue, setState, showTip, type LiveTip } from "./ui.ts";

const LANG = "fr-FR";

/** Silence qui clôt la dictée une fois la parole commencée. */
const SILENCE_MS = 2_000;

/** Délai laissé pour commencer à parler. */
const FIRST_WORD_MS = 8_000;

/** Durée maximale d'une dictée : un bruit de fond continu ne garde pas le micro ouvert. */
const MAX_LISTEN_MS = 120_000;

/** Délai laissé au moteur pour signaler sa fin après stop(), avant de la forcer. */
const END_GRACE_MS = 5_000;

const UNAVAILABLE = "Dictée locale en français indisponible dans ce navigateur.";

const ERRORS: Record<string, string> = {
  "not-allowed": "Micro bloqué : autorise-le pour x.com (icône à gauche de l'adresse), puis réessaie.",
  "audio-capture": "Aucun micro accessible : vérifie qu'il est branché et autorisé pour Chrome dans les réglages du système.",
  "service-not-allowed": UNAVAILABLE,
  "language-not-supported": UNAVAILABLE,
  aborted: "Dictée interrompue : le micro est peut-être utilisé par une autre application.",
};

type Availability = "available" | "downloadable" | "downloading" | "unavailable";
type LocalOptions = { langs: string[]; processLocally: true };

/** Français, sur l'appareil uniquement : jamais de repli sur un service distant. */
const LOCAL: LocalOptions = { langs: [LANG], processLocally: true };

/** Sous-ensemble de la Web Speech API utilisé ici : la lib DOM de TypeScript ne déclare pas SpeechRecognition. */
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  processLocally: boolean;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

type RecognitionClass = {
  new (): Recognition;
  available(options: LocalOptions): Promise<Availability>;
  install(options: LocalOptions): Promise<boolean>;
};

/** Constructeur de reconnaissance, s'il sait travailler sur l'appareil. */
function recognitionClass(): RecognitionClass | null {
  const scope = globalThis as unknown as Record<string, unknown>;
  const candidate = scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
  if (typeof candidate !== "function") return null;
  const statics = candidate as unknown as Record<string, unknown>;
  return typeof statics.available === "function" && typeof statics.install === "function"
    ? (candidate as unknown as RecognitionClass)
    : null;
}

async function availability(Recognition: RecognitionClass): Promise<Availability> {
  return Recognition.available(LOCAL).catch((): Availability => "unavailable");
}

/**
 * Le micro n'est proposé que si le modèle français peut tourner sur l'appareil :
 * déjà installé, ou téléchargeable au premier clic. Un navigateur sans
 * reconnaissance locale (Brave, par exemple) n'a pas de bouton.
 */
export async function dictationAvailable(): Promise<boolean> {
  const Recognition = recognitionClass();
  return Recognition !== null && (await availability(Recognition)) !== "unavailable";
}

/** Reçoit l'éditeur une fois la dictée écrite dedans. */
export type Dictated = (editor: HTMLElement) => void;

/** Dictée en cours : une seule à la fois dans la page. */
let active: { stop(): void } | null = null;
let preparing = false;

/**
 * Clic sur le micro : lance la dictée, ou l'arrête si une dictée est en cours.
 * Le texte retranscrit s'ajoute au brouillon, puis `onDictated` prend le relais.
 */
export async function toggleDictation(
  button: HTMLButtonElement,
  toolbar: HTMLElement,
  onDictated: Dictated,
): Promise<void> {
  if (active) return active.stop();
  if (preparing) return;

  const Recognition = recognitionClass();
  if (!Recognition) return finish(button, "error", UNAVAILABLE, "error");
  const editor = findEditor(toolbar);
  if (!editor) return showTip(button, "Zone de texte introuvable", "error");

  preparing = true;
  try {
    if (await prepare(button, Recognition)) listen(button, toolbar, editor, Recognition, onDictated);
  } finally {
    preparing = false;
  }
}

/**
 * Vérifie que le modèle français est présent sur l'appareil, et le télécharge
 * sinon. Vrai si l'écoute peut commencer. Après un téléchargement, un nouveau
 * clic est demandé : le micro ne s'ouvre jamais sans geste de l'utilisateur.
 */
async function prepare(button: HTMLButtonElement, Recognition: RecognitionClass): Promise<boolean> {
  const status = await availability(Recognition);
  if (status === "available") return true;
  if (status === "unavailable") {
    finish(button, "error", UNAVAILABLE, "error");
    return false;
  }

  // « downloadable » ou « downloading » : téléchargement unique, que ce clic autorise.
  setState(button, "loading");
  showTip(button, "Téléchargement du modèle de dictée français, une seule fois…", "info");
  const installed = await Recognition.install(LOCAL).catch(() => false);
  if (installed) finish(button, "done", "Modèle de dictée prêt : clique sur le micro pour parler.", "info");
  else finish(button, "error", "Le modèle de dictée n'a pas pu être téléchargé. Réessaie plus tard.", "error");
  return false;
}

function listen(
  button: HTMLButtonElement,
  toolbar: HTMLElement,
  editor: HTMLElement,
  Recognition: RecognitionClass,
  onDictated: Dictated,
): void {
  const recognition = new Recognition();
  recognition.lang = LANG;
  recognition.processLocally = true;
  // Pas d'arrêt à la première pause : la fin de la dictée est décidée ici.
  recognition.continuous = true;
  recognition.interimResults = true;

  let transcript = "";
  let error = "";
  let live: LiveTip | null = null;
  let silenceTimer = 0;
  let watchdog = 0;
  let graceTimer = 0;
  let ended = false;

  // Fin de la dictée, une seule fois, qu'elle vienne du moteur ou du délai de grâce.
  const end = (): void => {
    if (ended) return;
    ended = true;
    window.clearTimeout(silenceTimer);
    window.clearTimeout(graceTimer);
    window.clearInterval(watchdog);
    live?.close();
    active = null;
    void conclude(button, toolbar, editor, transcript, error, onDictated);
  };

  const stop = (): void => {
    if (ended || graceTimer) return;
    window.clearTimeout(silenceTimer);
    // Le temps que les derniers mots soient arrêtés, avant l'événement end.
    setState(button, "loading");
    recognition.stop();
    // Un moteur qui ne signale jamais sa fin bloquerait le micro : on la force.
    graceTimer = window.setTimeout(() => {
      recognition.abort();
      end();
    }, END_GRACE_MS);
  };

  const stopAfter = (ms: number): void => {
    window.clearTimeout(silenceTimer);
    silenceTimer = window.setTimeout(stop, ms);
  };

  // Le micro est ouvert, autorisation accordée.
  recognition.onstart = () => {
    setState(button, "listening");
    live = openLiveTip(button, "Je t'écoute…");
    stopAfter(FIRST_WORD_MS);
    // Garde-fous : durée maximale, et composeur fermé pendant l'écoute, qui
    // emporte avec lui le seul bouton capable d'arrêter le micro.
    const startedAt = Date.now();
    watchdog = window.setInterval(() => {
      if (!button.isConnected || Date.now() - startedAt >= MAX_LISTEN_MS) stop();
    }, 1_000);
  };
  // Chaque événement porte la liste complète des segments, provisoires compris.
  recognition.onresult = (event) => {
    if (ended) return;
    transcript = joinTranscript(Array.from(event.results, (result) => result[0]?.transcript ?? ""));
    live?.update(transcript);
    if (!graceTimer) stopAfter(SILENCE_MS);
  };
  recognition.onerror = (event) => {
    error = event.error;
  };
  recognition.onend = end;

  active = { stop };
  // Jusqu'à l'ouverture du micro, qui peut attendre la réponse à la demande d'autorisation.
  setState(button, "loading");
  try {
    recognition.start();
  } catch (err) {
    active = null;
    console.error("[xCorrect]", err);
    finish(button, "error", UNAVAILABLE, "error");
  }
}

/**
 * Ajoute la dictée à la fin du brouillon, ou explique pourquoi rien n'a été
 * écrit. Une dictée qui n'a pas pu être écrite n'est jamais perdue : elle part
 * dans le presse-papiers.
 */
async function conclude(
  button: HTMLButtonElement,
  toolbar: HTMLElement,
  editor: HTMLElement,
  transcript: string,
  error: string,
  onDictated: Dictated,
): Promise<void> {
  if (!transcript) {
    if (!error || error === "no-speech") return finish(button, "idle", "Aucune parole détectée.", "info");
    return finish(button, "error", ERRORS[error] ?? `Dictée interrompue (${error}).`, "error");
  }

  try {
    // X a pu remonter l'éditeur pendant l'écoute : on le retrouve depuis la barre d'action.
    const target = editor.isConnected ? editor : toolbar.isConnected ? findEditor(toolbar) : null;
    if (!target) return await rescue(button, "Composeur fermé pendant la dictée", transcript, "Texte dicté");

    setState(button, "loading");
    const written = await appendText(target, transcript);
    if (written !== "written") {
      return await rescue(button, `Insertion impossible, ${failureNote(written)}`, transcript, "Texte dicté");
    }
    setState(button, "idle");
    onDictated(target);
  } catch (err) {
    // Exception du DOM en cours d'écriture : le bouton ne doit pas rester bloqué.
    console.error("[xCorrect]", err);
    await rescue(button, "Erreur inattendue, vérifie le brouillon avant de publier", transcript, "Texte dicté");
  }
}
