(function () {
  "use strict";

  const religious = new Map([
    ["dios", "Dios"], ["jesus", "Jesús"], ["jesús", "Jesús"],
    ["senor", "Señor"], ["señor", "Señor"], ["cristo", "Cristo"],
    ["espiritu", "Espíritu"], ["espíritu", "Espíritu"]
  ]);

  const safe = new Map([
    ["senora", "señora"], ["santisimo", "santísimo"], ["corazon", "corazón"],
    ["cancion", "canción"], ["presentacion", "presentación"], ["oracion", "oración"],
    ["adoracion", "adoración"], ["salvacion", "salvación"], ["bendicion", "bendición"],
    ["perdon", "perdón"], ["tambien", "también"], ["aqui", "aquí"],
    ["alli", "allí"], ["amen", "amén"], ["dia", "día"], ["angel", "ángel"],
    ["angeles", "ángeles"], ["grasias", "gracias"], ["nesecito", "necesito"],
    ["resivir", "recibir"], ["recivir", "recibir"], ["adorasion", "adoración"]
  ]);

  const wordPattern = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/gu;
  const endingPattern = /([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)([\s.,;:!?…¡¿)}\]}'"-])$/u;
  const fuzzyVocabulary = [...new Set([...safe.values()])]
    .filter(word => word.length >= 6)
    .map(word => ({ normalized: normalizeWord(word), replacement: word }));

  function normalizeWord(word) {
    return String(word || "").toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function distanceAtMostOne(left, right) {
    if (left === right) return 0;
    if (Math.abs(left.length - right.length) > 1) return 2;
    if (left.length === right.length) {
      const differences = [];
      for (let index = 0; index < left.length; index += 1) {
        if (left[index] !== right[index]) differences.push(index);
        if (differences.length > 2) return 2;
      }
      if (differences.length === 1) return 1;
      if (differences.length === 2) {
        const [first, second] = differences;
        return second === first + 1 && left[first] === right[second] && left[second] === right[first] ? 1 : 2;
      }
      return 2;
    }
    const shorter = left.length < right.length ? left : right;
    const longer = left.length < right.length ? right : left;
    let shortIndex = 0;
    let longIndex = 0;
    let skipped = false;
    while (shortIndex < shorter.length && longIndex < longer.length) {
      if (shorter[shortIndex] === longer[longIndex]) {
        shortIndex += 1;
        longIndex += 1;
      } else if (skipped) {
        return 2;
      } else {
        skipped = true;
        longIndex += 1;
      }
    }
    return 1;
  }

  function fuzzyCorrection(word) {
    const normalized = normalizeWord(word);
    if (normalized.length < 6) return null;
    const candidates = fuzzyVocabulary.filter(candidate => distanceAtMostOne(normalized, candidate.normalized) === 1);
    return candidates.length === 1 ? matchCase(word, candidates[0].replacement, false) : null;
  }

  function matchCase(original, replacement, forceCapitalization) {
    if (forceCapitalization) return replacement;
    if (original === original.toUpperCase() && original.length > 1) return replacement.toUpperCase();
    if (/^[A-ZÁÉÍÓÚÜÑ]/u.test(original)) return replacement.charAt(0).toUpperCase() + replacement.slice(1);
    return replacement;
  }

  function correctionFor(word) {
    const key = String(word || "").toLocaleLowerCase("es");
    if (religious.has(key)) return matchCase(word, religious.get(key), true);
    if (safe.has(key)) return matchCase(word, safe.get(key), false);
    return fuzzyCorrection(word);
  }

  function capitalize(word) {
    return word.charAt(0).toLocaleUpperCase("es") + word.slice(1);
  }

  function startsSentence(prefix) {
    return /(?:^|[.!?\n])\s*$/u.test(prefix);
  }

  function findFinishedWord(text, caret = String(text || "").length, contextBefore = "") {
    const localPrefix = String(text || "").slice(0, caret);
    const prefix = String(contextBefore || "") + localPrefix;
    const match = prefix.match(endingPattern);
    if (!match) return null;
    const original = match[1];
    let replacement = correctionFor(original) || original;
    if (startsSentence(prefix.slice(0, match.index))) replacement = capitalize(replacement);
    if (!replacement || replacement === original) return null;
    const end = localPrefix.length - match[2].length;
    if (end - original.length < 0) return null;
    return { start: end - original.length, end, replacement };
  }

  function correctOnCommit(text) {
    const source = String(text || "");
    return source.replace(wordPattern, (word, offset) => {
      let replacement = correctionFor(word) || word;
      if (startsSentence(source.slice(0, offset))) replacement = capitalize(replacement);
      return replacement;
    });
  }

  function attach(field) {
    if (!field || field.dataset.autocorrectAttached === "true") return;
    field.dataset.autocorrectAttached = "true";
    field.spellcheck = true;
    field.setAttribute("autocorrect", "on");
    field.setAttribute("lang", "es");
    let composing = false;
    field.addEventListener("compositionstart", () => { composing = true; });
    field.addEventListener("compositionend", () => { composing = false; });
    field.addEventListener("input", event => {
      if (composing || event.isComposing || field.selectionStart == null || field.selectionStart !== field.selectionEnd) return;
      const correction = findFinishedWord(field.value, field.selectionStart);
      if (!correction) return;
      const caret = field.selectionStart;
      field.setRangeText(correction.replacement, correction.start, correction.end, "end");
      const nextCaret = caret + correction.replacement.length - (correction.end - correction.start);
      field.setSelectionRange(nextCaret, nextCaret);
    });
  }

  window.HimnarioAutocorrect = Object.freeze({ attach, correctionFor, correctOnCommit, findFinishedWord });
})();
