// The rolling number and text widgets of the archive view.
//
// Construction lives here so the page only has to push new values.
import { createRollingClock } from "./rolling-clock";
import { createRollingNumber, createRollingText } from "@kitlangton/rolling-number";

const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;

export function createArchiveWidgets() {
  const rollingMotion = {
    duration: 460,
    motionBlur: true,
    animated: true,
  };
  const updateFooterClock = createRollingClock($("#clock"));
  const numberOptions = {
    ...rollingMotion,
    locales: "en-US",
    format: { minimumIntegerDigits: 2, useGrouping: false },
  };
  const fileCounter = createRollingNumber($("#selected-number"), {
    ...numberOptions,
    value: 1,
  });
  const columnCounter = createRollingNumber($("#column-index"), {
    ...numberOptions,
    value: 3,
  });
  const codeOptions = {
    ...numberOptions,
    format: { minimumIntegerDigits: 3, useGrouping: false },
    value: 1,
  };
  const textOptions = {
    ...rollingMotion,
    transition: "direct" as const,
    stagger: "none" as const,
  };
  const selectionTitle = createRollingText($("#selected-title"), {
    ...textOptions,
    text: $("#selected-title").textContent ?? "",
  });
  const columnTitle = createRollingText($("#column-name"), {
    ...textOptions,
    text: $("#column-name").textContent ?? "",
  });
  const hoverTitle = createRollingText($("#hover-title"), { ...textOptions, text: "" });
  const categoryTitle = createRollingText($("#archive-category"), {
    ...textOptions,
    text: $("#archive-category").textContent ?? "",
  });
  const clearanceTitle = createRollingText($("#selected-clearance"), {
    ...textOptions,
    text: $("#selected-clearance").textContent ?? "",
  });
  const rollingTitles = [selectionTitle, columnTitle, hoverTitle, categoryTitle, clearanceTitle];
  const selectedCode = createRollingNumber($("#selected-code"), codeOptions);
  const hoverCode = createRollingNumber($("#hover-code"), codeOptions);
  return {
    updateFooterClock,
    fileCounter,
    columnCounter,
    selectedCode,
    hoverCode,
    selectionTitle,
    columnTitle,
    hoverTitle,
    categoryTitle,
    clearanceTitle,
    rollingTitles,
  };
}
