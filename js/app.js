"use strict";

const PAGE_SIZE = 30;
const SEARCH_DELAY = 150;
const FAVORITES_KEY = "karaoke-desban-2026:favorites:v1";
const STORAGE_NOTICE = "Neste navegador, as favoritas ficam disponíveis só enquanto esta página estiver aberta.";
const COPY_FEEDBACK_DURATION = 2600;
const UNKNOWN_LANGUAGE = "Idioma não informado";
const numberFormat = new Intl.NumberFormat("pt-BR");
const languageOrder = new Intl.Collator("pt-BR");
const languageAliases = new Map([
  ["bra", "Português"],
  ["portugues", "Português"],
  ["eua", "Inglês"],
  ["ingles", "Inglês"],
  ["esp", "Espanhol"],
  ["espanhol", "Espanhol"],
  ["fra", "Francês"],
  ["frances", "Francês"],
  ["ita", "Italiano"],
  ["italiano", "Italiano"],
  ["jap", "Japonês"],
  ["japones", "Japonês"],
]);

const searchForm = document.querySelector("#catalog-search");
const searchInput = document.querySelector("#search");
const clearSearch = document.querySelector("#clear-search");
const languageSelect = document.querySelector("#language");
const resultCount = document.querySelector("#result-count");
const catalogViews = document.querySelector("#catalog-views");
const viewAll = document.querySelector("#view-all");
const viewFavorites = document.querySelector("#view-favorites");
const favoritesCount = document.querySelector("#favorites-count");
const storageNotice = document.querySelector("#storage-notice");
const songList = document.querySelector("#song-list");
const songTemplate = document.querySelector("#song-template");
const emptyResults = document.querySelector("#empty-results");
const emptyFavorites = document.querySelector("#empty-favorites");
const resetFilters = document.querySelector("#reset-filters");
const browseCatalog = document.querySelector("#browse-catalog");
const loadError = document.querySelector("#load-error");
const errorDetail = document.querySelector("#error-detail");
const retryLoad = document.querySelector("#retry-load");
const loadMore = document.querySelector("#load-more");
const copyFeedback = document.querySelector("#copy-feedback");

let catalog = [];
let results = [];
let favoriteIds = new Set();
let showingFavorites = false;
let renderedCount = 0;
let searchTimer;
let copyFeedbackTimer;
let copiedButton = null;
let copyRequest = 0;

function normalizeText(value) {
  return value.normalize("NFD").replace(/\p{Mark}/gu, "").toLowerCase();
}

function normalizeLanguage(value) {
  const alias = normalizeText(value ?? "").replace(/^[\p{P}\s]+|[\p{P}\s]+$/gu, "");
  return languageAliases.get(alias) ?? UNKNOWN_LANGUAGE;
}

function hashRecord(record) {
  let hash = 2166136261;
  for (let index = 0; index < record.length; index += 1) {
    hash = Math.imul(hash ^ record.charCodeAt(index), 16777619);
  }
  return (hash >>> 0).toString(36);
}

function serializeSong({ codigo, interprete, titulo, inicio_letra, idioma, pagina }) {
  return JSON.stringify([codigo, interprete, titulo, inicio_letra, idioma, pagina]);
}

function resolveIdCollisions(entries, collidingIds) {
  const groups = new Map();
  for (const entry of entries) {
    if (!collidingIds.has(entry.id)) continue;

    const group = groups.get(entry.id) ?? [];
    group.push({ record: serializeSong(entry.song), entry });
    groups.set(entry.id, group);
  }

  // Desempata registros idênticos ou hashes iguais sem usar a ordem dos resultados.
  for (const group of groups.values()) {
    group.sort((first, second) => {
      if (first.record === second.record) return 0;
      return first.record < second.record ? -1 : 1;
    });
    for (let index = 1; index < group.length; index += 1) {
      group[index].entry.id += `:${index}`;
    }
  }
}

function indexCatalog(songs) {
  const ids = new Set();
  const collidingIds = new Set();
  const languages = new Map();
  const entries = songs.map((song) => {
    const { interprete, titulo, codigo, inicio_letra, idioma } = song;
    const id = `${codigo}:${hashRecord(serializeSong(song))}`;
    if (ids.has(id)) collidingIds.add(id);
    ids.add(id);

    if (!languages.has(idioma)) languages.set(idioma, normalizeLanguage(idioma));
    return {
      id,
      song,
      language: languages.get(idioma),
      searchFields: [interprete, titulo, codigo, inicio_letra].map(normalizeText),
    };
  });

  if (collidingIds.size > 0) resolveIdCollisions(entries, collidingIds);
  return entries;
}

function readFavorites() {
  let stored;
  try {
    stored = localStorage.getItem(FAVORITES_KEY);
  } catch {
    storageNotice.textContent = STORAGE_NOTICE;
    return new Set();
  }

  try {
    const ids = JSON.parse(stored);
    return new Set(Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

function saveFavorites() {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favoriteIds]));
    storageNotice.textContent = "";
  } catch {
    if (!storageNotice.textContent) storageNotice.textContent = STORAGE_NOTICE;
  }
}

function populateLanguages(entries) {
  const languages = new Set();
  const unresolved = new Map();

  for (const { language, song } of entries) {
    if (language === UNKNOWN_LANGUAGE) {
      const original = song.idioma;
      unresolved.set(original, (unresolved.get(original) ?? 0) + 1);
    } else {
      languages.add(language);
    }
  }

  const options = [...languages].sort(languageOrder.compare);
  if (unresolved.size > 0) {
    options.push(UNKNOWN_LANGUAGE);
    console.warn("Idiomas do catálogo a revisar (valor original e quantidade).", Object.fromEntries(unresolved));
  }

  for (const language of options) {
    languageSelect.add(new Option(language, language));
  }
}

function createCard(entry) {
  const { id, song, language } = entry;
  const card = songTemplate.content.firstElementChild.cloneNode(true);
  card.querySelector(".song-title").textContent = song.titulo;
  card.querySelector(".song-artist").textContent = song.interprete;
  card.querySelector(".song-lyrics").textContent = song.inicio_letra || "Trecho não informado";
  card.querySelector(".song-language-value").textContent = language;

  const code = card.querySelector(".song-code");
  code.querySelector("strong").textContent = song.codigo;
  code.setAttribute("aria-label", `Copiar código ${song.codigo} de ${song.titulo}`);
  code.addEventListener("click", () => copyCode(song.codigo, code));

  const favorite = card.querySelector(".song-favorite");
  favorite.setAttribute("aria-label", `Favoritar ${song.titulo}, de ${song.interprete}`);
  favorite.setAttribute("aria-pressed", String(favoriteIds.has(id)));
  favorite.addEventListener("click", () => toggleFavorite(id, favorite));
  return card;
}

function renderMore(moveFocus = false, pageSize = PAGE_SIZE) {
  const fragment = document.createDocumentFragment();
  const end = Math.min(renderedCount + pageSize, results.length);

  for (let index = renderedCount; index < end; index += 1) {
    fragment.append(createCard(results[index]));
  }

  const firstNewTitle = fragment.querySelector(".song-title");
  songList.append(fragment);
  renderedCount = end;

  if (moveFocus && firstNewTitle) {
    firstNewTitle.tabIndex = -1;
    firstNewTitle.focus();
  }

  loadMore.hidden = renderedCount >= results.length;
}

function updateResultState() {
  const noFavorites = showingFavorites && favoriteIds.size === 0;
  emptyFavorites.hidden = !noFavorites;
  emptyResults.hidden = results.length > 0 || noFavorites;
  const resultLabel = results.length === 1 ? "resultado" : "resultados";
  resultCount.textContent = `${numberFormat.format(results.length)} ${resultLabel}`;
}

function updateResults() {
  clearTimeout(searchTimer);
  searchTimer = undefined;
  const query = normalizeText(searchInput.value.trim());
  const selectedLanguage = languageSelect.value;

  results = showingFavorites || selectedLanguage || query
    ? catalog.filter(({ id, language, searchFields }) => (
      (!showingFavorites || favoriteIds.has(id))
      && (!selectedLanguage || language === selectedLanguage)
      && (!query || searchFields.some((field) => field.includes(query)))
    ))
    : catalog;

  songList.replaceChildren();
  renderedCount = 0;
  renderMore();
  updateResultState();
}

function selectView(favoritesOnly) {
  if (showingFavorites === favoritesOnly) return;

  showingFavorites = favoritesOnly;
  viewAll.setAttribute("aria-pressed", String(!favoritesOnly));
  viewFavorites.setAttribute("aria-pressed", String(favoritesOnly));
  updateResults();
}

function toggleFavorite(id, button) {
  const adding = !favoriteIds.has(id);
  if (adding) {
    favoriteIds.add(id);
  } else {
    favoriteIds.delete(id);
  }

  button.setAttribute("aria-pressed", String(adding));
  favoritesCount.textContent = numberFormat.format(favoriteIds.size);
  saveFavorites();

  if (showingFavorites && !adding) removeFavoriteCard(id, button);
}

function removeFavoriteCard(id, button) {
  const card = button.closest(".song-card");
  const neighboringCard = card.nextElementSibling ?? card.previousElementSibling;
  const hadFocus = document.activeElement === button;

  results.splice(results.findIndex((entry) => entry.id === id), 1);
  card.remove();
  renderedCount -= 1;
  renderMore(false, 1);
  updateResultState();

  if (hadFocus) {
    const nextButton = neighboringCard?.querySelector(".song-favorite") ?? viewFavorites;
    nextButton.focus();
  }
}

function copyWithSelection(value) {
  const activeElement = document.activeElement;
  const field = document.createElement("textarea");
  field.className = "visually-hidden";
  field.style.position = "fixed";
  field.style.inset = "0 auto auto 0";
  field.value = value;
  field.readOnly = true;
  document.body.append(field);

  try {
    field.focus({ preventScroll: true });
    field.select();
    field.setSelectionRange(0, field.value.length);
    return document.execCommand("copy") === true;
  } catch {
    return false;
  } finally {
    field.remove();
    activeElement?.focus({ preventScroll: true });
  }
}

async function copyCode(value, button) {
  const request = ++copyRequest;
  let copied = false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      copied = true;
    }
  } catch {
    // A escrita pela API moderna pode ser bloqueada pelas permissões do navegador.
  }

  if (request !== copyRequest) return;
  if (!copied) copied = copyWithSelection(value);

  clearTimeout(copyFeedbackTimer);
  copiedButton?.classList.remove("is-copied");
  copiedButton = copied ? button : null;
  copiedButton?.classList.add("is-copied");
  copyFeedback.replaceChildren(copied ? "Código copiado!" : `Não foi possível copiar o código ${value}.`);

  copyFeedbackTimer = setTimeout(() => {
    copiedButton?.classList.remove("is-copied");
    copiedButton = null;
    copyFeedback.textContent = "";
  }, COPY_FEEDBACK_DURATION);
}

async function loadCatalog(restoreFocus = false) {
  loadError.hidden = true;
  resultCount.textContent = "Carregando catálogo…";

  try {
    const response = await fetch("data/catalogo_karaoke.json");
    if (!response.ok) {
      throw new Error(`Falha ao carregar o catálogo (HTTP ${response.status}).`);
    }

    const { musicas } = await response.json();
    catalog = indexCatalog(musicas);
    populateLanguages(catalog);
  } catch (error) {
    resultCount.textContent = "Erro de carregamento";
    if (window.location.protocol === "file:") {
      errorDetail.textContent = "Abra esta página pelo endereço de um servidor local para acessar o catálogo.";
    }
    loadError.hidden = false;
    if (restoreFocus) retryLoad.focus();
    console.error(error);
    return;
  }

  searchInput.disabled = false;
  languageSelect.disabled = false;
  const savedFavorites = readFavorites();
  favoriteIds = savedFavorites.size > 0
    ? new Set(catalog.filter(({ id }) => savedFavorites.has(id)).map(({ id }) => id))
    : savedFavorites;
  favoritesCount.textContent = numberFormat.format(favoriteIds.size);
  catalogViews.hidden = false;
  updateResults();
  if (restoreFocus) searchInput.focus();
}

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (searchTimer !== undefined) updateResults();

  if (document.activeElement === searchInput && window.matchMedia("(pointer: coarse)").matches) {
    searchInput.blur();
  }
});

searchInput.addEventListener("input", () => {
  clearSearch.hidden = searchInput.value.length === 0;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(updateResults, SEARCH_DELAY);
});

languageSelect.addEventListener("change", updateResults);
viewAll.addEventListener("click", () => selectView(false));
viewFavorites.addEventListener("click", () => selectView(true));
browseCatalog.addEventListener("click", () => {
  selectView(false);
  viewAll.focus();
});

function clearQuery() {
  searchInput.value = "";
  clearSearch.hidden = true;
  searchInput.focus();
  updateResults();
}

clearSearch.addEventListener("click", clearQuery);
resetFilters.addEventListener("click", () => {
  languageSelect.selectedIndex = 0;
  clearQuery();
});
loadMore.addEventListener("click", () => renderMore(true));
retryLoad.addEventListener("click", () => loadCatalog(true));

loadCatalog();
