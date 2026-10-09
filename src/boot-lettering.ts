import "./boot-lettering.css";
import { fitElement, measureLine, onTextFitRefit } from "./text-fit";

/** Fixed opening phrases, revealed letter by letter in the system font stack. */
const phrases = {
  access: "ACCESS PERMISSION REQUIRED",
  identity: "ID CONFIRMED : JOYCE MOORE",
  request: "REQUEST RECEIVED",
  processing: "START PROCESSING...",
  processingGlitch: "              SING...",
  permission: "PERMISSION AUTHORIZED",
  brand: "RHINE LAB",
  welcome: "WELCOME TO",
  company: "RHINE LAB.LLC.",
  database: "INTERNAL DATABASE",
};

export type PhraseKey = keyof typeof phrases;

/** Fixed phrase reveal cells, measured and spaced by the platform font. */
export class BootLettering {
  private label = document.createElement("span");
  private phrases: {
    text: string;
    node: HTMLSpanElement;
    letters: HTMLSpanElement[];
  }[];
  private value: string | undefined;

  constructor(private host: HTMLElement, keys: PhraseKey[]) {
    this.label.className = "boot-phrase-label";
    this.phrases = keys.map((key) => {
      const text = phrases[key];
      const node = document.createElement("span");
      node.className = "boot-phrase";
      node.dataset.phrase = key;
      node.setAttribute("aria-hidden", "true");
      node.hidden = true;
      const letters = [...text].map((character) => {
        const cell = document.createElement("span");
        cell.className = "boot-phrase-letter";
        cell.textContent = character;
        node.append(cell);
        return cell;
      });
      return { text, node, letters };
    });
    host.classList.add("has-boot-lettering");
    host.replaceChildren(this.label, ...this.phrases.map((p) => p.node));
  }

  /** Shrink `element` until the widest authored phrase fits its `--fit-width`.
   *  Measuring the authored phrases rather than the revealed text keeps one
   *  stable size across the whole reveal. */
  fitWithin(element: HTMLElement = this.host) {
    const refit = () => {
      const style = getComputedStyle(element);
      fitElement(
        element,
        Math.max(...this.phrases.map((phrase) => measureLine(phrase.text, style))),
      );
    };
    refit();
    return onTextFitRefit(refit);
  }

  setText(value: string) {
    if (this.value === value) return;
    this.value = value;
    this.label.textContent = value;
    const active = value
      ? this.phrases.find((p) => p.text.startsWith(value))
      : undefined;
    // A new, unauthored phrase stays readable until it is added to the table.
    this.host.classList.toggle(
      "boot-lettering-fallback",
      Boolean(value && !active),
    );
    for (const phrase of this.phrases) {
      const visible = phrase === active;
      if (phrase.node.hidden === visible) phrase.node.hidden = !visible;
      if (!visible) continue;
      phrase.letters.forEach((letter, i) => {
        const hidden = i >= value.length;
        if (letter.hidden !== hidden) letter.hidden = hidden;
      });
    }
  }
}
