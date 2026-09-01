// ============================================================================
// MISE À JOUR — action "fred" de votre Google Apps Script
// ============================================================================
// À coller dans votre projet Apps Script existant, à la place de la fonction
// qui gère actuellement `?action=fred` (celle qui renvoie déjà HY Spread,
// Baa10Y, taux 2/10 ans, CPI, etc.).
//
// Ce qui change : la liste FRED_SERIES_IDS ci-dessous contient maintenant les
// séries EXISTANTES + 10 NOUVELLES (WTI, EUR/USD, proxy dollar, taux 30 ans,
// core CPI, core PCE, chômage, retail sales, production industrielle, Fed
// Funds) — demandées pour les superpositions dans Wolf Labo.
//
// Gardez votre FRED_API_KEY existante telle quelle (remplacez juste la
// référence ci-dessous si son nom de variable diffère chez vous).
// ============================================================================

var FRED_SERIES_IDS = [
  // --- déjà en place, inchangées ---
  'BAMLH0A0HYM2', 'BAA10Y', 'AAA10Y', 'CORBLACBS', 'DRALACBS', 'BUSLOANS',
  'DRTSCILM', 'DRSDCILM', 'TDSP', 'CP', 'BOGZ1LM883164115Q', 'GDP',
  'WALCL', 'WTREGEN', 'RRPONTSYD', 'DGS2', 'DGS10', 'T10Y2Y', 'CPIAUCSL',
  // --- nouvelles (Wolf Labo — superpositions macro élargies) ---
  'DCOILWTICO',   // WTI (pétrole)
  'DEXUSEU',      // EUR/USD
  'DTWEXBGS',     // proxy dollar (indice pondéré échanges — ICE DXY n'existe pas sur FRED)
  'DGS30',        // taux 30 ans
  'CPILFESL',     // Core CPI
  'PCEPILFE',     // Core PCE (jauge Fed)
  'UNRATE',       // taux de chômage
  'RSAFS',        // ventes au détail
  'INDPRO',       // production industrielle
  'DFF'           // Fed Funds effectif
];

function handleFredAction() {
  var apiKey = FRED_API_KEY; // <- réutilise votre clé existante, ne pas en créer une nouvelle
  var out = {};
  FRED_SERIES_IDS.forEach(function (seriesId) {
    try {
      var url = 'https://api.stlouisfed.org/fred/series/observations'
        + '?series_id=' + seriesId
        + '&api_key=' + apiKey
        + '&file_type=json'
        + '&observation_start=2006-01-01';
      var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      if (res.getResponseCode() !== 200) {
        out[seriesId] = { error: 'HTTP ' + res.getResponseCode() };
        return;
      }
      var json = JSON.parse(res.getContentText());
      if (!json.observations) {
        out[seriesId] = { error: 'réponse FRED sans observations' };
        return;
      }
      out[seriesId] = json.observations.map(function (o) {
        return { date: o.date, value: o.value }; // "." = valeur manquante, filtré déjà côté client (parseFloat -> NaN -> ignoré)
      });
    } catch (e) {
      out[seriesId] = { error: String(e) };
    }
  });
  return out;
}

// Si votre doGet(e) actuel ressemble à :
//   if (e.parameter.action === 'fred') { return respondJson(handleFredAction_OLD()); }
// remplacez juste l'appel par handleFredAction() ci-dessus (même signature,
// même forme de réponse : { SERIES_ID: [{date,value},...] } ou { SERIES_ID: {error:"..."} }).
