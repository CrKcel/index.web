import { loadContent } from "./archive-content.mjs";

const { records } = await loadContent();
console.log(`Validated ${records.length} archive records.`);
