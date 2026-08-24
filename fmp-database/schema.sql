-- Schéma volontairement générique (JSON brut + quelques colonnes indexées), plutôt
-- qu'une table rigide par type de donnée avec une colonne par champ. Raison : sans clé
-- API pour tester en direct, on ne connaît pas avec certitude la forme exacte de chaque
-- réponse FMP (noms de champs qui changent parfois d'un endpoint à l'autre). Ce schéma
-- encaisse n'importe quelle forme de JSON sans jamais planter à l'import, et reste
-- interrogeable (SQLite sait lire du JSON avec json_extract()). Si besoin de colonnes
-- typées plus tard pour une catégorie précise (ex. dividendes), c'est un ajout simple
-- une fois qu'on a vu de vraies données — pas une réécriture.

CREATE TABLE IF NOT EXISTS raw_data (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  category    TEXT NOT NULL,   -- clé du registre ENDPOINTS (ex. 'income_statement')
  symbol      TEXT NOT NULL,   -- ticker FMP tel qu'interrogé (ex. 'KO', 'MC.PA')
  period      TEXT,            -- 'annual' | 'quarter' | NULL si non applicable
  item_date   TEXT,            -- date/fiscalDate/year+quarter extrait du JSON quand possible (tri/filtre rapide)
  payload     TEXT NOT NULL,   -- JSON brut complet de CET élément
  fetched_at  TEXT NOT NULL    -- horodatage ISO de l'import (traçabilité, utile si FMP révise une donnée plus tard)
);
CREATE INDEX IF NOT EXISTS idx_raw_data_lookup ON raw_data(category, symbol, item_date);
CREATE INDEX IF NOT EXISTS idx_raw_data_symbol ON raw_data(symbol);

-- Journal de chaque appel — indispensable pour un import de 2000-3000 tickers étalé sur
-- plusieurs jours : savoir précisément ce qui a marché/échoué/était vide, sans avoir à
-- rejouer tout l'import pour le découvrir. discover.py ET ingest.py y écrivent tous les deux.
CREATE TABLE IF NOT EXISTS fetch_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  category      TEXT NOT NULL,
  symbol        TEXT NOT NULL,
  period        TEXT,
  status        TEXT NOT NULL,  -- 'ok' | 'empty' | 'error'
  http_status   INTEGER,
  error_message TEXT,
  item_count    INTEGER,
  fetched_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fetch_log_lookup ON fetch_log(category, symbol);
