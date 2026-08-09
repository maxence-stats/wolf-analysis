# Wolf Analysis — Code actuel

Export complet du projet tel qu'il existe aujourd'hui, prêt à être déposé dans un
dossier de travail Claude Code. Structure attendue :

```
wolf-analysis/
├── index.html
├── css/
│   └── style.css
└── js/
    └── app.js
```

Voir `CLAUDE.md` pour le contexte complet (règles, architecture des données, design
system, fonctionnalités faites/en cours/à décider).

---

## `index.html`

```html
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Wolf Analysis</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
<script src="https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js"></script>
<link rel="stylesheet" href="css/style.css">
</head>
<body>
<div class="wrap">

  <div class="brand-bar">
    <img src="https://i.postimg.cc/43WmYDB1/20260714-LOGO-WINTER-PNG.png" alt="Wolf Academy" class="brand-logo">
    <div>
      <div class="brand-title">Wolf Analysis</div>
      <div class="brand-sub">Onglet Analyse</div>
    </div>
  </div>

  <div class="topbar">
    <div class="search-wrap">
      <span class="search-icon">⌕</span>
      <input type="text" id="companySearch" class="search-input" placeholder="Rechercher une entreprise…" autocomplete="off">
      <div class="search-suggestions" id="searchSuggestions"></div>
    </div>
    <div class="active-company-label" id="activeCompanyLabel"></div>
    <div class="sync-status">
      <span class="sync-dot" id="syncDot"></span>
      <span id="syncLabel">Connexion au Google Sheet…</span>
      <button class="refresh-btn" id="refreshBtn">↻ Mettre à jour</button>
    </div>
  </div>
  <div id="debugLine" style="display:none;font-family:'JetBrains Mono',monospace;font-size:11px;color:#5C6470;text-align:right;margin:-8px 0 12px;"></div>

  <div id="loadingScreen">
    <div class="spinner"></div>
    <p>Récupération des données en direct depuis le Google Sheet…</p>
  </div>

  <div id="errorScreen" style="display:none;">
    <h3>Impossible de lire le Google Sheet</h3>
    <p id="errorDetail">Vérifie que le fichier est bien publié sur le web pour l'onglet « DATA BASE 20 ans », via <code>Fichier → Partager → Publier sur le web</code> (choisis bien cet onglet précis, pas "Document entier"), avec le format CSV.</p>
    <p><button class="refresh-btn" onclick="loadData()">↻ Mettre à jour</button></p>
  </div>

  <div id="dashboard">

    <div class="page-nav">
      <button class="page-nav-btn active" data-page="pageAnalyse">Analyse</button>
      <button class="page-nav-btn" data-page="pageSecteur">Secteur</button>
    </div>

    <div id="pageAnalyse" class="page active">
    <div class="header">
      <div class="logo-box"><img id="logoImg" alt="Logo entreprise"></div>
      <div class="id-block">
        <p class="eyebrow" id="tickerLbl">—</p>
        <h1 class="company-name" id="companyName">—</h1>
        <div class="tags">
          <span class="tag" id="secteurTag">Secteur —</span>
          <span class="tag" id="sousSecteurTag">Sous-secteur —</span>
        </div>
      </div>
      <div class="price-block">
        <div class="price-label">Prix actuel</div>
        <div class="price-value" id="prixActuel">— <sup>€</sup></div>
        <div class="price-year" id="priceYear"></div>
      </div>
    </div>

    <div class="gauge-card">
      <div class="gauge-top">
        <div class="gauge-title">Positionnement sur l'échelle de valorisation</div>
        <div class="gauge-verdict" id="verdictBadge">—</div>
      </div>
      <svg class="gauge" id="gaugeSvg" viewBox="0 0 1000 90"></svg>
      <div class="gauge-legend">
        <div><span class="dot" style="background:var(--green)"></span>Zone d'achat — sous le prix cible</div>
        <div><span class="dot" style="background:var(--gold)"></span>Zone équitable — entre cible et juste valeur</div>
        <div><span class="dot" style="background:var(--red)"></span>Zone chère — au-dessus de la juste valeur</div>
      </div>
    </div>

    <div class="section-label">Ratios clés</div>
    <div class="ratio-grid">
      <div class="ratio-card"><div class="k">Prix juste</div><div class="v" id="rPrixJuste">—</div><div class="sub">valorisation intrinsèque</div></div>
      <div class="ratio-card"><div class="k">Prix cible</div><div class="v" id="rPrixCible">—</div><div class="sub">seuil d'achat, marge de sécurité</div></div>
      <div class="ratio-card"><div class="k">Écart de valeur</div><div class="v" id="rEcart">—</div><div class="sub">entre prix juste et prix cible</div></div>
      <div class="ratio-card"><div class="k">Rendement du dividende</div><div class="v" id="rRendDiv">—</div><div class="sub">sur prix actuel</div></div>
      <div class="ratio-card"><div class="k">Rendement total estimé, 5 ans</div><div class="v" id="rRend5">—</div><div class="sub">retour à la juste valeur + dividende</div></div>
      <div class="ratio-card"><div class="k">FCF PEG</div><div class="v" id="rFcfpeg">—</div><div class="sub">prix / FCF rapporté à la croissance</div></div>
      <div class="ratio-card"><div class="k">Médiane P/FCF</div><div class="v" id="rMedFcf">—</div><div class="sub">multiple médian historique</div></div>
      <div class="ratio-card"><div class="k">Payout ratio</div><div class="v" id="rPayout">—</div><div class="sub">dernier exercice</div></div>
    </div>

    <div class="section-label">Historique</div>
    <div class="chart-grid">
      <div class="chart-card wide" id="stockCard">
        <div class="chart-card-head">
          <div><h3>Cours de bourse (hebdomadaire)</h3><p>Clôture hebdomadaire et moyenne mobile 200 semaines</p></div>
          <div class="chart-card-actions">
            <button class="zoom-btn" onclick="openZoom('stock',&quot;Cours de bourse&quot;)" aria-label="Agrandir">⤢</button>
          </div>
        </div>
        <div class="range-buttons" id="rangeButtons">
          <button data-range="1">1a</button>
          <button data-range="2">2a</button>
          <button data-range="3">3a</button>
          <button data-range="5">5a</button>
          <button data-range="10">10a</button>
          <button data-range="20">20a</button>
          <button data-range="max" class="active">Max</button>
        </div>
        <div class="chart-holder" style="height:320px;"><canvas id="chartStock"></canvas></div>
        <div class="stock-status" id="stockStatus"></div>
        <div class="stock-source" id="stockSourceNote">Source : Yahoo Finance (repli automatique sur Stooq si indisponible)</div>
      </div>

      <div class="chart-card">
        <div class="chart-card-head">
          <div><h3>Dividende &amp; Payout ratio</h3><p>Croissance du dividende par action et part du résultat distribuée</p></div>
          <div class="chart-card-actions">
            <span class="chart-badge" id="badgeDiv">CAGR 10a —</span>
            <button class="zoom-btn" onclick="openZoom('div',&quot;Dividende &amp; Payout ratio&quot;)" aria-label="Agrandir">⤢</button>
          </div>
        </div>
        <div class="chart-holder"><canvas id="chartDiv"></canvas></div>
      </div>

      <div class="chart-card">
        <div class="chart-card-head">
          <div><h3>Chiffre d'affaires</h3><p>Évolution du CA, en milliards d'euros</p></div>
          <div class="chart-card-actions">
            <span class="chart-badge" id="badgeCA">CAGR 10a —</span>
            <button class="zoom-btn" onclick="openZoom('ca',&quot;Chiffre d'affaires&quot;)" aria-label="Agrandir">⤢</button>
          </div>
        </div>
        <div class="chart-holder"><canvas id="chartCA"></canvas></div>
      </div>

      <div class="chart-card">
        <div class="chart-card-head">
          <div><h3>Marge opérationnelle &amp; ROIC</h3><p>Rentabilité d'exploitation et retour sur capital investi</p></div>
          <div class="chart-card-actions">
            <button class="zoom-btn" onclick="openZoom('marges',&quot;Marge opérationnelle &amp; ROIC&quot;)" aria-label="Agrandir">⤢</button>
          </div>
        </div>
        <div class="chart-holder"><canvas id="chartMarges"></canvas></div>
      </div>

      <div class="chart-card">
        <div class="chart-card-head">
          <div><h3>Free Cash Flow par action</h3><p>Cash réellement généré après investissements</p></div>
          <div class="chart-card-actions">
            <span class="chart-badge" id="badgeFcf">CAGR 10a —</span>
            <button class="zoom-btn" onclick="openZoom('fcf',&quot;Free Cash Flow par action&quot;)" aria-label="Agrandir">⤢</button>
          </div>
        </div>
        <div class="chart-holder"><canvas id="chartFCF"></canvas></div>
      </div>

      <div class="chart-card">
        <div class="chart-card-head">
          <div><h3>Multiple P/FCF payé par le marché</h3><p>Combien les investisseurs paient chaque euro de FCF</p></div>
          <div class="chart-card-actions">
            <button class="zoom-btn" onclick="openZoom('pfcf',&quot;Multiple P/FCF payé par le marché&quot;)" aria-label="Agrandir">⤢</button>
          </div>
        </div>
        <div class="chart-holder"><canvas id="chartPFCF"></canvas></div>
      </div>

      <div class="chart-card">
        <div class="chart-card-head">
          <div><h3>Actions en circulation</h3><p>Dilution ou rachats d'actions au fil du temps</p></div>
          <div class="chart-card-actions">
            <span class="chart-badge" id="badgeActions">CAGR 20a —</span>
            <button class="zoom-btn" onclick="openZoom('actions',&quot;Actions en circulation&quot;)" aria-label="Agrandir">⤢</button>
          </div>
        </div>
        <div class="chart-holder"><canvas id="chartActions"></canvas></div>
      </div>

      <div class="chart-card">
        <div class="chart-card-head">
          <div><h3>Dette / OCF</h3><p>Multiple de dette nette rapporté au cash flow opérationnel</p></div>
          <div class="chart-card-actions">
            <button class="zoom-btn" onclick="openZoom('dette',&quot;Dette / OCF&quot;)" aria-label="Agrandir">⤢</button>
          </div>
        </div>
        <div class="chart-holder"><canvas id="chartDette"></canvas></div>
      </div>

      <div class="chart-card">
        <div class="chart-card-head">
          <div><h3>Trésorerie &amp; investissements</h3><p>Cash disponible face au cash investi (capex/croissance)</p></div>
          <div class="chart-card-actions">
            <button class="zoom-btn" onclick="openZoom('cash',&quot;Trésorerie &amp; investissements&quot;)" aria-label="Agrandir">⤢</button>
          </div>
        </div>
        <div class="chart-holder"><canvas id="chartCash"></canvas></div>
      </div>
    </div>
    </div>

    <div id="pageSecteur" class="page">
      <div class="section-label">Répartition par secteur (GICS)</div>
      <div class="sector-grid" id="sectorGrid"></div>
    </div>

    <footer>
      Données fournies par Wolf Analysis
      <img src="https://i.postimg.cc/43WmYDB1/20260714-LOGO-WINTER-PNG.png" alt="Wolf Analysis" style="height:16px;width:auto;vertical-align:middle;margin-left:6px;border-radius:3px;">
    </footer>
  </div>
</div>

<div id="zoomModal" onclick="if(event.target===this) closeZoom()">
  <div class="zoom-panel">
    <div class="zoom-panel-head">
      <h3 id="zoomTitle">—</h3>
      <button class="zoom-close" onclick="closeZoom()" aria-label="Fermer">✕</button>
    </div>
    <div class="zoom-canvas-holder"><canvas id="zoomCanvas"></canvas></div>
    <div class="zoom-footer">
      Données fournies par Wolf Analysis
      <img src="https://i.postimg.cc/43WmYDB1/20260714-LOGO-WINTER-PNG.png" alt="Wolf Analysis">
    </div>
  </div>
</div>

<script src="js/app.js"></script>
</body>
</html>

```

---

## `css/style.css`

```css
:root{
    --bg:#0D1013;
    --panel:#151A1F;
    --panel-2:#1B2128;
    --hair:#262E36;
    --text:#E9EBEE;
    --text-dim:#8B93A0;
    --text-faint:#5C6470;
    --gold:#D9A441;
    --gold-2:#F0C877;
    --violet:#8B7FE8;
    --blue:#4A9FE0;
    --green:#4FD1A5;
    --red:#E5636B;
    --font-display:'Space Grotesk', sans-serif;
    --font-body:'Inter', sans-serif;
    --font-mono:'JetBrains Mono', monospace;
    --shadow-card:0 12px 32px -16px rgba(0,0,0,0.55);
    --shadow-card-hover:0 16px 40px -14px rgba(0,0,0,0.6);
    --card-bg:linear-gradient(155deg, var(--panel-2) 0%, var(--panel) 100%);
  }
  *{box-sizing:border-box;}
  body{
    margin:0;
    background:
      radial-gradient(1100px 480px at 12% -8%, rgba(217,164,65,0.10), transparent 60%),
      radial-gradient(900px 520px at 92% 8%, rgba(139,127,232,0.07), transparent 55%),
      var(--bg);
    background-attachment:fixed;
    color:var(--text);
    font-family:var(--font-body);
    -webkit-font-smoothing:antialiased;
  }
  .wrap{max-width:1760px;margin:0 auto;padding:24px 32px 60px;}

  /* ---------- BRAND BAR ---------- */
  .brand-bar{display:flex;align-items:center;gap:14px;margin-bottom:18px;}
  .brand-logo{height:42px;width:auto;border-radius:8px;flex-shrink:0;filter:drop-shadow(0 4px 14px rgba(217,164,65,0.25));}
  .brand-title{
    font-family:var(--font-display);font-weight:700;font-size:19px;line-height:1.1;
    background:linear-gradient(135deg, var(--gold-2) 0%, var(--gold) 100%);
    -webkit-background-clip:text;background-clip:text;color:transparent;
  }
  .brand-sub{font-family:var(--font-mono);font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--text-faint);margin-top:3px;}

  /* ---------- TOP BAR : recherche + statut sync ---------- */
  .topbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;flex-wrap:wrap;}
  .active-company-label{font-family:var(--font-mono);font-size:12.5px;color:var(--text-dim);}
  .active-company-label b{color:var(--text);font-weight:700;}
  .sync-status{display:flex;align-items:center;gap:10px;font-family:var(--font-mono);font-size:11.5px;color:var(--text-faint);}
  .sync-dot{width:7px;height:7px;border-radius:50%;background:var(--green);flex-shrink:0;}
  .sync-dot.stale{background:var(--text-faint);}
  .refresh-btn{
    background:linear-gradient(135deg, var(--gold-2) 0%, var(--gold) 100%);border:1px solid var(--gold);color:#1a1305;
    font-family:var(--font-mono);font-weight:700;font-size:11.5px;padding:7px 14px;border-radius:20px;cursor:pointer;
    box-shadow:0 4px 16px -6px rgba(217,164,65,0.55);transition:box-shadow .15s ease,transform .15s ease;
  }
  .refresh-btn:hover{box-shadow:0 6px 22px -6px rgba(217,164,65,0.7);transform:translateY(-1px);}

  /* ---------- SEARCH ---------- */
  .search-wrap{position:relative;flex:1;min-width:200px;max-width:320px;}
  .search-icon{position:absolute;left:13px;top:50%;transform:translateY(-50%);color:var(--text-faint);font-size:14px;pointer-events:none;}
  .search-input{width:100%;background:var(--panel);border:1px solid var(--hair);border-radius:20px;padding:8px 14px 8px 34px;color:var(--text);font-family:var(--font-body);font-size:13px;outline:none;}
  .search-input::placeholder{color:var(--text-faint);}
  .search-input:focus{border-color:var(--gold);}
  .search-suggestions{position:absolute;top:calc(100% + 6px);left:0;right:0;background:var(--panel-2);border:1px solid var(--hair);border-radius:12px;overflow:hidden;z-index:20;display:none;box-shadow:var(--shadow-card-hover);}
  .search-suggestions.open{display:block;}
  .search-suggestion{padding:9px 14px;font-size:13px;color:var(--text);cursor:pointer;}
  .search-suggestion:hover{background:rgba(217,164,65,0.12);}

  /* ---------- PAGE NAV ---------- */
  .page-nav{display:flex;gap:22px;border-bottom:1px solid var(--hair);margin-bottom:20px;}
  .page-nav button{
    background:none;border:none;color:var(--text-faint);font-family:var(--font-body);font-weight:500;
    font-size:14px;padding:10px 2px 12px;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;
  }
  .page-nav button:hover{color:var(--text-dim);}
  .page-nav button.active{color:var(--text);border-bottom-color:var(--gold);font-weight:600;box-shadow:0 1px 10px -2px rgba(217,164,65,0.5);}
  .page{display:none;}
  .page.active{display:block;}

  /* ---------- SECTEUR VIEW ---------- */
  .sector-grid{display:grid;grid-template-columns:repeat(auto-fill, minmax(280px, 1fr));gap:14px;}
  .sector-box{background:var(--card-bg);border:1px solid var(--hair);border-radius:14px;padding:16px 18px;min-height:120px;box-shadow:var(--shadow-card);}
  .sector-box h3{font-family:var(--font-display);font-size:14px;font-weight:600;margin:0 0 4px;color:var(--text);}
  .sector-box .count{font-family:var(--font-mono);font-size:11px;color:var(--text-faint);margin-bottom:12px;}
  .sector-companies{display:flex;flex-wrap:wrap;gap:8px;}
  .sector-logo{
    width:44px;height:44px;background:#fff;border-radius:8px;display:flex;align-items:center;justify-content:center;
    padding:6px;cursor:pointer;border:1px solid var(--hair);transition:transform .12s ease;
  }
  .sector-logo:hover{transform:translateY(-2px);border-color:var(--gold);}
  .sector-logo img{max-width:100%;max-height:100%;object-fit:contain;}
  .sector-empty{font-size:12px;color:var(--text-faint);font-style:italic;}

  /* ---------- STATE SCREENS ---------- */
  #loadingScreen, #errorScreen{
    padding:60px 26px;text-align:center;background:var(--card-bg);border:1px solid var(--hair);border-radius:14px;box-shadow:var(--shadow-card);
  }
  #loadingScreen p, #errorScreen p{color:var(--text-dim);font-size:13.5px;margin:10px auto 0;max-width:460px;line-height:1.6;}
  .spinner{width:26px;height:26px;border-radius:50%;border:3px solid var(--hair);border-top-color:var(--gold);margin:0 auto;animation:spin 0.8s linear infinite;}
  @keyframes spin{to{transform:rotate(360deg);}}
  #errorScreen{border-color:rgba(229,99,107,0.35);}
  #errorScreen h3{font-family:var(--font-display);color:var(--red);margin:0 0 6px;}
  #errorScreen code{background:var(--panel-2);padding:2px 6px;border-radius:4px;font-size:11.5px;color:var(--gold);}
  #dashboard{display:none;}

  /* ---------- HEADER ---------- */
  .header{
    display:flex;align-items:center;gap:22px;padding:22px 26px;
    background:var(--card-bg);
    border:1px solid var(--hair);border-radius:14px;flex-wrap:wrap;box-shadow:var(--shadow-card);
  }
  .logo-box{width:76px;height:76px;background:#fff;border-radius:10px;display:flex;align-items:center;justify-content:center;padding:10px;flex-shrink:0;box-shadow:0 6px 18px -8px rgba(0,0,0,0.5);}
  .logo-box img{max-width:100%;max-height:100%;object-fit:contain;}
  .id-block{flex:1;min-width:220px;}
  .eyebrow{font-family:var(--font-mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--gold);margin:0 0 4px;}
  .company-name{font-family:var(--font-display);font-weight:700;font-size:28px;margin:0 0 8px;line-height:1.1;}
  .tags{display:flex;gap:8px;flex-wrap:wrap;}
  .tag{font-family:var(--font-mono);font-size:11.5px;padding:4px 10px;border-radius:20px;border:1px solid var(--hair);color:var(--text-dim);background:rgba(255,255,255,0.02);}
  .price-block{text-align:right;padding-left:10px;}
  .price-label{font-size:11px;color:var(--text-faint);text-transform:uppercase;letter-spacing:.1em;font-family:var(--font-mono);}
  .price-value{font-family:var(--font-mono);font-size:38px;font-weight:700;color:var(--text);line-height:1.1;}
  .price-value sup{font-size:16px;color:var(--text-dim);font-weight:500;}
  .price-year{font-size:11px;color:var(--text-faint);font-family:var(--font-mono);margin-top:4px;}

  /* ---------- GAUGE ---------- */
  .gauge-card{margin-top:16px;padding:22px 26px 20px;background:var(--card-bg);border:1px solid var(--hair);border-radius:14px;box-shadow:var(--shadow-card);}
  .gauge-top{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:14px;flex-wrap:wrap;gap:8px;}
  .gauge-title{font-family:var(--font-display);font-weight:600;font-size:15px;color:var(--text);}
  .gauge-verdict{font-family:var(--font-mono);font-size:12px;font-weight:600;padding:3px 10px;border-radius:20px;}
  .verdict-over{background:rgba(229,99,107,0.12);color:var(--red);border:1px solid rgba(229,99,107,0.3);box-shadow:0 0 18px -6px rgba(229,99,107,0.4);}
  .verdict-fair{background:rgba(217,164,65,0.12);color:var(--gold);border:1px solid rgba(217,164,65,0.3);box-shadow:0 0 18px -6px rgba(217,164,65,0.4);}
  .verdict-under{background:rgba(79,209,165,0.12);color:var(--green);border:1px solid rgba(79,209,165,0.3);box-shadow:0 0 18px -6px rgba(79,209,165,0.4);}
  svg.gauge{width:100%;height:auto;display:block;}
  .gauge-legend{display:flex;gap:22px;margin-top:10px;flex-wrap:wrap;}
  .gauge-legend div{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--text-dim);font-family:var(--font-mono);}
  .dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}

  /* ---------- RATIO GRID ---------- */
  .section-label{font-family:var(--font-mono);font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint);margin:38px 0 14px;display:flex;align-items:center;gap:12px;}
  .section-label::after{content:"";flex:1;height:1px;background:var(--hair);}
  .ratio-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;}
  .ratio-card{background:var(--card-bg);border:1px solid var(--hair);border-radius:12px;padding:16px 18px;box-shadow:var(--shadow-card);transition:box-shadow .15s ease,transform .15s ease,border-color .15s ease;}
  .ratio-card:hover{box-shadow:var(--shadow-card-hover);transform:translateY(-2px);border-color:rgba(217,164,65,0.3);}
  .ratio-card .k{font-size:11px;color:var(--text-faint);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;font-weight:500;}
  .ratio-card .v{font-family:var(--font-mono);font-weight:700;font-size:24px;letter-spacing:-0.01em;color:var(--text);}
  .ratio-card .v.pos{color:var(--green);}
  .ratio-card .v.neg{color:var(--red);}
  .ratio-card .sub{font-size:11px;color:var(--text-faint);margin-top:4px;font-family:var(--font-mono);}

  /* ---------- CHARTS ---------- */
  .chart-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;}
  .chart-card{background:var(--card-bg);border:1px solid var(--hair);border-radius:14px;padding:18px 18px 8px;box-shadow:var(--shadow-card);transition:box-shadow .15s ease,border-color .15s ease;}
  .chart-card:hover{box-shadow:var(--shadow-card-hover);border-color:rgba(217,164,65,0.22);}
  .chart-card.wide{grid-column:1 / -1;}
  .chart-card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;}
  .chart-card h3{font-family:var(--font-display);font-size:14.5px;font-weight:600;margin:0 0 2px;color:var(--text);}
  .chart-card p{margin:0 0 12px;font-size:12px;color:var(--text-faint);}
  .chart-holder{position:relative;height:220px;}
  .chart-card-actions{display:flex;align-items:center;gap:8px;flex-shrink:0;}
  .chart-badge{font-family:var(--font-mono);font-size:10.5px;font-weight:700;padding:3px 9px;border-radius:12px;border:1px solid var(--hair);color:var(--text-dim);white-space:nowrap;}
  .chart-badge.pos{color:var(--green);border-color:rgba(79,209,165,0.35);box-shadow:0 0 12px -5px rgba(79,209,165,0.5);}
  .chart-badge.neg{color:var(--red);border-color:rgba(229,99,107,0.35);box-shadow:0 0 12px -5px rgba(229,99,107,0.5);}
  .zoom-btn{background:var(--panel-2);border:1px solid var(--hair);color:var(--text-dim);width:26px;height:26px;border-radius:8px;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0;line-height:1;}
  .zoom-btn:hover{border-color:var(--gold);color:var(--text);}

  /* ---------- STOCK CHART ---------- */
  .range-buttons{display:flex;gap:6px;margin:10px 0 14px;flex-wrap:wrap;}
  .range-buttons button{font-family:var(--font-mono);font-size:11px;font-weight:600;padding:5px 11px;border-radius:14px;border:1px solid var(--hair);background:var(--panel-2);color:var(--text-dim);cursor:pointer;}
  .range-buttons button:hover{border-color:var(--gold);color:var(--text);}
  .range-buttons button.active{background:linear-gradient(135deg, var(--gold-2) 0%, var(--gold) 100%);color:#1a1305;border-color:var(--gold);box-shadow:0 4px 14px -6px rgba(217,164,65,0.55);}
  .stock-status{font-size:12px;color:var(--text-faint);padding:6px 0;display:none;}
  .stock-source{font-size:10.5px;color:var(--text-faint);font-family:var(--font-mono);margin-top:8px;}

  /* ---------- ZOOM MODAL ---------- */
  #zoomModal{display:none;position:fixed;inset:0;background:rgba(4,5,7,0.78);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);z-index:999;align-items:center;justify-content:center;padding:30px;}
  .zoom-panel{background:var(--card-bg);border:1px solid var(--hair);border-radius:16px;padding:22px 24px;width:min(1100px,92vw);max-height:88vh;display:flex;flex-direction:column;box-shadow:0 24px 60px -20px rgba(0,0,0,0.7);}
  .zoom-panel-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;}
  .zoom-panel-head h3{font-family:var(--font-display);font-size:18px;font-weight:600;margin:0;}
  .zoom-close{background:none;border:1px solid var(--hair);color:var(--text-dim);width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:15px;}
  .zoom-close:hover{border-color:var(--red);color:var(--red);}
  .zoom-canvas-holder{position:relative;flex:1;min-height:420px;}
  .zoom-footer{margin-top:16px;text-align:center;font-size:11px;color:var(--text-faint);font-family:var(--font-mono);}
  .zoom-footer img{height:16px;width:auto;vertical-align:middle;margin-left:6px;border-radius:3px;}

  footer{margin-top:40px;text-align:center;font-size:11px;color:var(--text-faint);font-family:var(--font-mono);}

  @media (max-width:1300px){
    .chart-grid{grid-template-columns:repeat(2,1fr);}
  }
  @media (max-width:760px){
    .ratio-grid{grid-template-columns:repeat(2,1fr);}
    .chart-grid{grid-template-columns:1fr;}
    .price-block{text-align:left;padding-left:0;}
    .header{flex-direction:column;align-items:flex-start;}
    .wrap{padding:20px 16px 60px;}
  }

```

---

## `js/app.js`

```javascript
/* ============================================================
   CONFIG — à adapter si l'ID du fichier ou l'onglet changent
   ============================================================ */
const PUBLISHED_ID = "2PACX-1vTQNfcV1SOt2tfFCP8NYYmm_dPDiEeS_Z_LCQHSU9tRvgGi47wBMYeHyibKLSi2PXWqnvazg5fv3qnx";
const GID = "1880505297"; // onglet "DATA BASE 20 ans"
const CSV_URL = `https://docs.google.com/spreadsheets/d/e/${PUBLISHED_ID}/pub?gid=${GID}&single=true&output=csv`;
// Pas de rafraîchissement automatique : on recharge au chargement de la page,
// et uniquement quand on clique sur "↻ Rafraîchir".

/* Index des colonnes A -> BG (0-based), tel que décrit dans l'onglet */
const COL = {
  nom:0, annee:1, lienImage:2, ticker:3, secteur:4, sousSecteur:5,
  prixActuel:7, prixJuste:8, prixCible:9, ecartValeur:10,
  dividende:20, rendementDiv:21, cagrDiv10:23,
  payoutFCF:25, payoutRatio:26,
  fcfpeg:35, fcfParAction:38, cagrFcf10:40, pFcf:13, medianePFCF:42,
  ca:44, cagrCA10:46, margeOp:48, roic:49,
  cash:52, cashInvesti:53, actions:54, cagrActions:55,
  detteOCF:58
};

let companies = {};   // { nomEntreprise: [ {annee, ...valeurs}, ... ] sorted asc }
let activeCompany = null;
let chartInstances = {};

/* ============================================================
   CHARGEMENT DES DONNÉES — 2 méthodes, avec repli automatique
   1) fetch() sur le CSV publié — la méthode standard une fois hébergé en ligne
   2) balise <script> (JSONP) — contourne les restrictions que Chrome applique
      aux requêtes réseau depuis un fichier ouvert en local (file://)
   ============================================================ */
const SHEET_ID = "1V4NaDx7PvnJkPMtddGgW23Hjn0jon1g0UjoC4o6FchM";

let loadSettled = false; // partagé entre les deux méthodes, pour n'accepter que le premier succès

function loadData(){
  document.getElementById('loadingScreen').style.display = 'block';
  document.getElementById('errorScreen').style.display = 'none';
  document.getElementById('dashboard').style.display = 'none';
  setSync('loading');
  setDebug('Tentative des deux méthodes de connexion en parallèle…');
  loadSettled = false;

  // Les deux méthodes démarrent en même temps. Chacune a son propre minuteur
  // qui ne dépend PAS de la requête réseau pour se déclencher (setTimeout pur),
  // donc même si l'une reste bloquée indéfiniment sans jamais répondre,
  // l'autre prend le relais et rien ne reste bloqué.
  tryFetchCSV();
  tryGvizScript();

  setTimeout(function(){
    if (!loadSettled){
      loadSettled = true;
      showError("Aucune des deux méthodes n'a abouti après 9 secondes. Cela signifie presque toujours que le fichier n'est pas encore publié pour cet onglet précis — vérifie dans Google Sheets : Fichier → Partager → Publier sur le web, sélectionne l'onglet « DATA BASE 20 ans », format CSV, puis clique sur Publier (et confirme si demandé).");
    }
  }, 9000);
}

function tryFetchCSV(){
  const controller = new AbortController();
  const hardTimeout = setTimeout(() => controller.abort(), 5000);

  fetch(CSV_URL + '&_=' + Date.now(), { signal: controller.signal, cache: 'no-store' })
    .then(async res => {
      if (loadSettled) return;
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      if (text.trim().toLowerCase().startsWith('<!doctype') || text.trim().toLowerCase().startsWith('<html')){
        throw new Error('Réponse HTML au lieu de CSV');
      }
      const parsed = Papa.parse(text.trim(), { skipEmptyLines: true });
      if (!parsed.data || parsed.data.length < 2) throw new Error('CSV vide ou illisible');
      if (loadSettled) return;
      loadSettled = true;
      clearTimeout(hardTimeout);
      setDebug('Connecté via la méthode CSV (fetch).');
      handleCsvRows(parsed.data);
    })
    .catch(err => {
      clearTimeout(hardTimeout);
      if (!loadSettled){
        setDebug('Méthode CSV (fetch) : ' + (err.name === 'AbortError' ? 'bloquée / délai dépassé' : err.message) + ' — en attente de la méthode alternative…');
      }
    });
}

function tryGvizScript(){
  const old = document.getElementById('gvizScript');
  if (old) old.remove();

  window.google = window.google || {};
  window.google.visualization = window.google.visualization || {};

  window.google.visualization.Query = {
    setResponse: function(data){
      if (loadSettled) return;
      try{
        if (!data || !data.table || !data.table.rows) throw new Error('table vide');
        const rows = [data.table.cols.map(c => c.label)].concat(
          data.table.rows.map(r => (r.c || []).map(cell => cell ? (cell.f != null ? cell.f : cell.v) : ''))
        );
        loadSettled = true;
        setDebug('Connecté via la méthode alternative (script).');
        handleCsvRows(rows);
      }catch(e){
        if (!loadSettled) setDebug('Méthode alternative (script) : ' + e.message);
      }
    }
  };

  const script = document.createElement('script');
  script.id = 'gvizScript';
  script.src = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${GID}&headers=1&_=${Date.now()}`;
  script.onerror = function(){
    if (!loadSettled) setDebug('Méthode alternative (script) : requête réseau bloquée.');
  };
  document.body.appendChild(script);
}

function setDebug(msg){
  const el = document.getElementById('debugLine');
  if (!el) return;
  el.textContent = msg;
  el.style.display = msg ? 'block' : 'none';
}

function showError(msg){
  document.getElementById('loadingScreen').style.display = 'none';
  document.getElementById('errorScreen').style.display = 'block';
  document.getElementById('errorDetail').textContent = msg;
  setSync('error');
}

function setSync(state){
  const dot = document.getElementById('syncDot');
  const label = document.getElementById('syncLabel');
  if (state === 'loading'){
    dot.classList.add('stale');
    label.textContent = 'Connexion au Google Sheet…';
  } else if (state === 'error'){
    dot.classList.add('stale');
    label.textContent = 'Échec de connexion';
  } else {
    dot.classList.remove('stale');
    const now = new Date();
    label.textContent = 'Synchronisé à ' + now.toLocaleTimeString('fr-FR');
  }
}

function parseNum(raw){
  if (raw == null) return null;
  let s = String(raw).trim();
  if (s === '' || s.startsWith('#')) return null; // cases vides ou erreurs type #DIV/0!
  s = s.replace(/\s/g,'').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}
function parseStr(raw){
  return raw == null ? '' : String(raw).trim();
}

function handleCsvRows(rows){
  if (!rows || rows.length < 2){
    showError("Le fichier CSV reçu est vide. Vérifie que l'onglet « DATA BASE 20 ans » contient bien des données publiées.");
    return;
  }

  companies = {};
  // rows[0] = ligne d'en-têtes, on la saute
  for (let i = 1; i < rows.length; i++){
    const c = rows[i];
    const nom = parseStr(c[COL.nom]);
    const annee = parseNum(c[COL.annee]);
    const prixActuel = parseNum(c[COL.prixActuel]);
    if (!nom || !annee || prixActuel == null) continue; // ligne vide / année sans données

    const row = {
      annee,
      lienImage: parseStr(c[COL.lienImage]),
      ticker: parseStr(c[COL.ticker]),
      secteur: parseStr(c[COL.secteur]),
      sousSecteur: parseStr(c[COL.sousSecteur]),
      prixActuel,
      prixJuste: parseNum(c[COL.prixJuste]),
      prixCible: parseNum(c[COL.prixCible]),
      ecartValeur: parseNum(c[COL.ecartValeur]),
      dividende: parseNum(c[COL.dividende]),
      rendementDiv: parseNum(c[COL.rendementDiv]),
      cagrDiv10: parseNum(c[COL.cagrDiv10]),
      payoutRatio: parseNum(c[COL.payoutRatio]),
      fcfpeg: parseNum(c[COL.fcfpeg]),
      fcfParAction: parseNum(c[COL.fcfParAction]),
      cagrFcf10: parseNum(c[COL.cagrFcf10]),
      pFcf: parseNum(c[COL.pFcf]),
      medianePFCF: parseNum(c[COL.medianePFCF]),
      ca: parseNum(c[COL.ca]),
      cagrCA10: parseNum(c[COL.cagrCA10]),
      margeOp: parseNum(c[COL.margeOp]),
      roic: parseNum(c[COL.roic]),
      detteOCF: parseNum(c[COL.detteOCF]),
      cash: parseNum(c[COL.cash]),
      cashInvesti: parseNum(c[COL.cashInvesti]),
      actions: parseNum(c[COL.actions]),
      cagrActions: parseNum(c[COL.cagrActions])
    };

    if (!companies[nom]) companies[nom] = [];
    companies[nom].push(row);
  }

  Object.keys(companies).forEach(nom => companies[nom].sort((a,b) => a.annee - b.annee));

  const names = Object.keys(companies);
  if (names.length === 0){
    showError("Aucune ligne exploitable n'a été trouvée dans l'onglet (colonnes NOM / Année / Prix Actuel vides).");
    return;
  }

  if (!activeCompany || !companies[activeCompany]) activeCompany = names[0];
  renderCompany(activeCompany);
  renderSectorView();

  document.getElementById('loadingScreen').style.display = 'none';
  document.getElementById('errorScreen').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';
  setSync('ok');
}

/* ============================================================
   PAGE SECTEUR — répartition GICS
   ============================================================ */
const GICS_SECTORS = [
  { key:'energie', label:'Énergie', match:['energ'] },
  { key:'materiaux', label:'Matériaux', match:['materia','matière'] },
  { key:'industrie', label:'Industrie', match:['industr'] },
  { key:'conso-discretionnaire', label:'Consommation discrétionnaire', match:['discretionnaire','discrétionnaire','cyclique'] },
  { key:'conso-base', label:'Consommation de base', match:['base','essentiel','staple','defensive','défensive'] },
  { key:'sante', label:'Santé', match:['sant','health'] },
  { key:'finance', label:'Finance', match:['financ','bancair','banque','assurance'] },
  { key:'tech', label:'Technologies de l\'information', match:['techno','information technology','logiciel','semi-conducteur'] },
  { key:'communication', label:'Services de communication', match:['communicat','telecom','média','media'] },
  { key:'utilities', label:'Services publics', match:['utilit','service public','électricité','eau'] },
  { key:'immobilier', label:'Immobilier', match:['immobil','real estate','reit'] }
];

function normalizeSector(raw){
  if (!raw) return null;
  const s = raw.toLowerCase();
  for (const sec of GICS_SECTORS){
    if (sec.match.some(kw => s.includes(kw))) return sec.key;
  }
  return null;
}

function renderSectorView(){
  const grid = document.getElementById('sectorGrid');
  if (!grid) return;

  const buckets = {};
  GICS_SECTORS.forEach(s => buckets[s.key] = []);
  buckets['autre'] = [];

  Object.keys(companies).forEach(nom => {
    const hist = companies[nom];
    const latest = hist[hist.length - 1];
    const key = normalizeSector(latest.secteur) || 'autre';
    buckets[key].push({ nom, logo: latest.lienImage, secteurBrut: latest.secteur });
  });

  const allBuckets = GICS_SECTORS.concat([{ key:'autre', label:'Autre / non classé' }]);

  grid.innerHTML = allBuckets.map(sec => {
    const list = buckets[sec.key];
    const logosHtml = list.length === 0
      ? '<div class="sector-empty">Aucune entreprise</div>'
      : list.map(c => `<div class="sector-logo" title="${c.nom.replace(/"/g,'&quot;')}" data-nom="${c.nom.replace(/"/g,'&quot;')}"><img src="${c.logo || ''}" alt="${c.nom.replace(/"/g,'&quot;')}"></div>`).join('');
    return `<div class="sector-box"><h3>${sec.label}</h3><div class="count">${list.length} entreprise${list.length>1?'s':''}</div><div class="sector-companies">${logosHtml}</div></div>`;
  }).join('');
}

function initSectorGrid(){
  const grid = document.getElementById('sectorGrid');
  if (!grid) return;
  grid.addEventListener('click', e => {
    const logo = e.target.closest('.sector-logo[data-nom]');
    if (logo) goToAnalyse(logo.dataset.nom);
  });
}

function goToAnalyse(nom){
  switchPage('pageAnalyse');
  selectCompany(nom);
}

function switchPage(pageId){
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === pageId));
  document.querySelectorAll('.page-nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === pageId));
}

function selectCompany(nom){
  if (!companies[nom]) return;
  activeCompany = nom;
  const label = document.getElementById('activeCompanyLabel');
  if (label) label.innerHTML = 'Entreprise sélectionnée : <b>' + nom + '</b>';
  renderCompany(nom);
}

function initSearch(){
  const input = document.getElementById('companySearch');
  const box = document.getElementById('searchSuggestions');
  if (!input || !box) return;

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (!q){ box.classList.remove('open'); box.innerHTML = ''; return; }
    const matches = Object.keys(companies).filter(n => n.toLowerCase().includes(q)).slice(0, 8);
    if (matches.length === 0){
      box.innerHTML = '<div class="search-suggestion" style="color:var(--text-faint);cursor:default;">Aucun résultat</div>';
    } else {
      box.innerHTML = matches.map(n => `<div class="search-suggestion" data-name="${n.replace(/"/g,'&quot;')}">${n}</div>`).join('');
    }
    box.classList.add('open');
  });

  box.addEventListener('click', e => {
    const item = e.target.closest('.search-suggestion[data-name]');
    if (!item) return;
    selectCompany(item.dataset.name);
    input.value = '';
    box.classList.remove('open');
    box.innerHTML = '';
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.search-wrap')) box.classList.remove('open');
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Escape'){ box.classList.remove('open'); input.blur(); }
    if (e.key === 'Enter'){
      const first = box.querySelector('.search-suggestion[data-name]');
      if (first){ selectCompany(first.dataset.name); input.value=''; box.classList.remove('open'); box.innerHTML=''; }
    }
  });
}

/* ============================================================
   RENDU D'UNE ENTREPRISE
   ============================================================ */
const css = getComputedStyle(document.documentElement);
const THEME = {
  gold: css.getPropertyValue('--gold').trim(),
  blue: css.getPropertyValue('--blue').trim(),
  green: css.getPropertyValue('--green').trim(),
  red: css.getPropertyValue('--red').trim(),
  dim: css.getPropertyValue('--text-dim').trim(),
  hair: css.getPropertyValue('--hair').trim()
};
function configureChartDefaults(){
  Chart.defaults.font.family = "'JetBrains Mono', monospace";
  Chart.defaults.font.size = 11;
  Chart.defaults.color = THEME.dim;
}
const baseAxis = { grid:{display:false}, ticks:{color:THEME.dim}, border:{color:THEME.hair} };
const baseGrid = { color: THEME.hair, drawTicks:false };

function fmtEUR(v, d=2){ return v==null ? 'N/D' : v.toLocaleString('fr-FR',{minimumFractionDigits:d,maximumFractionDigits:d}) + ' €'; }
function fmtPct(v, d=1){ return v==null ? 'N/D' : v.toLocaleString('fr-FR',{minimumFractionDigits:d,maximumFractionDigits:d}) + ' %'; }
function setBadge(id, label, value){
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('pos','neg');
  if (value == null){ el.textContent = label + ' —'; return; }
  el.textContent = label + ' ' + (value >= 0 ? '+' : '') + value.toLocaleString('fr-FR',{minimumFractionDigits:1,maximumFractionDigits:1}) + '%';
  el.classList.add(value >= 0 ? 'pos' : 'neg');
}

function renderCompany(nom){
  const hist = companies[nom];
  const latest = hist[hist.length - 1];
  const years = hist.map(r => r.annee);

  document.getElementById('logoImg').src = latest.lienImage || '';
  document.getElementById('tickerLbl').textContent = latest.ticker || '—';
  document.getElementById('companyName').textContent = nom;
  document.getElementById('secteurTag').textContent = 'Secteur — ' + (latest.secteur || '—');
  document.getElementById('sousSecteurTag').textContent = 'Sous-secteur — ' + (latest.sousSecteur || '—');
  document.getElementById('prixActuel').innerHTML = latest.prixActuel.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' <sup>€</sup>';
  document.getElementById('priceYear').textContent = 'Exercice ' + latest.annee;

  document.getElementById('rPrixJuste').textContent = fmtEUR(latest.prixJuste);
  document.getElementById('rPrixCible').textContent = fmtEUR(latest.prixCible);
  const ecartEl = document.getElementById('rEcart');
  ecartEl.className = 'v';
  if (latest.ecartValeur != null){
    ecartEl.textContent = fmtPct(latest.ecartValeur*100);
    ecartEl.classList.add(latest.ecartValeur >= 0 ? 'pos' : 'neg');
  } else { ecartEl.textContent = 'N/D'; }

  document.getElementById('rRendDiv').textContent = fmtPct(latest.rendementDiv);
  document.getElementById('rFcfpeg').textContent = latest.fcfpeg != null ? latest.fcfpeg.toLocaleString('fr-FR',{minimumFractionDigits:2}) : 'N/D';
  document.getElementById('rMedFcf').textContent = latest.medianePFCF != null ? latest.medianePFCF.toLocaleString('fr-FR',{minimumFractionDigits:1}) + 'x' : 'N/D';
  document.getElementById('rPayout').textContent = fmtPct(latest.payoutRatio);

  const rend5El = document.getElementById('rRend5');
  rend5El.className = 'v';
  if (latest.prixJuste != null && latest.prixActuel != null && latest.rendementDiv != null){
    const reversion = Math.pow(latest.prixJuste / latest.prixActuel, 1/5) - 1;
    const rend5 = reversion*100 + latest.rendementDiv;
    rend5El.textContent = (rend5>=0?'+':'') + fmtPct(rend5);
    rend5El.classList.add(rend5>=0 ? 'pos':'neg');
  } else { rend5El.textContent = 'N/D'; }

  drawGauge(latest);

  setBadge('badgeDiv', 'CAGR div. 10a', latest.cagrDiv10);
  setBadge('badgeCA', 'CAGR CA 10a', latest.cagrCA10);
  setBadge('badgeFcf', 'CAGR FCF 10a', latest.cagrFcf10);
  setBadge('badgeActions', 'CAGR actions 20a', latest.cagrActions);

  loadStockChart(latest.ticker);

  const series = k => hist.map(r => r[k]);

  destroyCharts();

  chartInstances.div = makeChart('div', 'chartDiv', {
    type:'bar',
    data:{ labels:years, datasets:[
      { label:'Dividende (€)', data:series('dividende'), backgroundColor:THEME.gold, borderRadius:4, yAxisID:'y', order:2, barPercentage:0.55 },
      { label:'Payout ratio (%)', data:series('payoutRatio'), type:'line', borderColor:THEME.blue, backgroundColor:THEME.blue, yAxisID:'y1', tension:0.35, spanGaps:true, pointRadius:3, order:1 }
    ]},
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{position:'bottom', labels:{boxWidth:8, usePointStyle:true}}},
      scales:{ x: baseAxis, y:{ position:'left', grid:baseGrid, ticks:{color:THEME.dim, callback:v=>v+' €'} }, y1:{ position:'right', grid:{display:false}, ticks:{color:THEME.dim, callback:v=>v+'%'} } }
    }
  });

  chartInstances.ca = makeChart('ca', 'chartCA', {
    type:'line',
    data:{ labels:years, datasets:[{ label:'CA (Md€)', data:series('ca').map(v => v==null?null:+(v/1000).toFixed(1)), borderColor:THEME.gold, backgroundColor:'rgba(217,164,65,0.15)', fill:true, tension:0.35, pointRadius:3, spanGaps:true }]},
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ x: baseAxis, y:{ grid:baseGrid, ticks:{color:THEME.dim, callback:v=>v+' Md€'} } } }
  });

  chartInstances.marges = makeChart('marges', 'chartMarges', {
    type:'line',
    data:{ labels:years, datasets:[
      { label:'Marge opérationnelle (%)', data:series('margeOp'), borderColor:THEME.gold, backgroundColor:THEME.gold, tension:0.35, pointRadius:3, spanGaps:true },
      { label:'ROIC (%)', data:series('roic'), borderColor:THEME.blue, backgroundColor:THEME.blue, tension:0.35, pointRadius:3, spanGaps:true }
    ]},
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom', labels:{boxWidth:8, usePointStyle:true}}}, scales:{ x: baseAxis, y:{ grid:baseGrid, ticks:{color:THEME.dim, callback:v=>v+'%'} } } }
  });

  chartInstances.fcf = makeChart('fcf', 'chartFCF', {
    type:'bar',
    data:{ labels:years, datasets:[{ label:'FCF / action (€)', data:series('fcfParAction'), backgroundColor:THEME.blue, borderRadius:4, barPercentage:0.6 }]},
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ x: baseAxis, y:{ grid:baseGrid, ticks:{color:THEME.dim, callback:v=>v+' €'} } } }
  });

  chartInstances.pfcf = makeChart('pfcf', 'chartPFCF', {
    type:'bar',
    data:{ labels:years, datasets:[
      { label:'P/FCF (x)', data:series('pFcf'), backgroundColor:THEME.gold, borderRadius:4, barPercentage:0.6, order:2 },
      { label:'Médiane P/FCF (x)', data:series('medianePFCF'), type:'line', borderColor:THEME.blue, backgroundColor:THEME.blue, tension:0, spanGaps:true, pointRadius:0, borderWidth:2, order:1 }
    ]},
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom', labels:{boxWidth:8, usePointStyle:true}}}, scales:{ x: baseAxis, y:{ grid:baseGrid, ticks:{color:THEME.dim, callback:v=>v+'x'} } } }
  });

  chartInstances.actions = makeChart('actions', 'chartActions', {
    type:'line',
    data:{ labels:years, datasets:[{ label:'Actions en circulation (M)', data:series('actions'), borderColor:THEME.blue, backgroundColor:'rgba(74,159,224,0.12)', fill:true, tension:0.35, pointRadius:3, spanGaps:true }]},
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ x: baseAxis, y:{ grid:baseGrid, ticks:{color:THEME.dim, callback:v=>v+'M'} } } }
  });

  chartInstances.dette = makeChart('dette', 'chartDette', {
    type:'bar',
    data:{ labels:years, datasets:[{ label:'Dette / OCF (x)', data:series('detteOCF'), backgroundColor:THEME.blue, borderRadius:4, barPercentage:0.6 }]},
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ x: baseAxis, y:{ grid:baseGrid, ticks:{color:THEME.dim, callback:v=>v+'x'} } } }
  });

  chartInstances.cash = makeChart('cash', 'chartCash', {
    type:'bar',
    data:{ labels:years, datasets:[
      { label:'Cash (M€)', data:series('cash'), backgroundColor:THEME.blue, borderRadius:4, barPercentage:0.55 },
      { label:'Cash investi (M€)', data:series('cashInvesti'), backgroundColor:THEME.gold, borderRadius:4, barPercentage:0.55 }
    ]},
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom', labels:{boxWidth:8, usePointStyle:true}}}, scales:{ x: baseAxis, y:{ grid:baseGrid, ticks:{color:THEME.dim, callback:v=>v+' M€'} } } }
  });
}

let chartConfigs = {};

function makeChart(key, id, config){
  chartConfigs[key] = config;
  return new Chart(document.getElementById(id).getContext('2d'), config);
}
function destroyCharts(){
  Object.values(chartInstances).forEach(ch => ch && ch.destroy());
  chartInstances = {};
  chartConfigs = {};
}

function cloneChartConfig(config){
  return {
    type: config.type,
    data: {
      labels: config.data.labels.slice(),
      datasets: config.data.datasets.map(ds => Object.assign({}, ds, { data: ds.data.slice() }))
    },
    options: config.options
  };
}

/* ============================================================
   COURS DE BOURSE — Yahoo Finance en priorité, repli sur Stooq
   si le fetch échoue (CORS non garanti côté Yahoo, pas d'API
   officielle). Hebdomadaire + SMA200.
   ============================================================ */
let stockFull = null;   // { dates, closes, sma }
let stockRange = 'max';
let stockRequestId = 0;

function mapTickerToYahoo(ticker){
  if (!ticker) return null;
  const parts = ticker.split(':');
  if (parts.length !== 2) return ticker;
  const [exch, sym] = parts;
  const map = {
    EPA:'.PA', PAR:'.PA', NASDAQ:'', NYSE:'', NYSEARCA:'',
    LON:'.L', LSE:'.L', ETR:'.DE', FRA:'.DE', XETR:'.DE',
    AMS:'.AS', BME:'.MC', MIL:'.MI', SWX:'.SW', TSE:'.T'
  };
  const suffix = map[exch.toUpperCase()];
  return sym + (suffix != null ? suffix : '');
}

function mapTickerToStooq(ticker){
  if (!ticker) return null;
  const parts = ticker.split(':');
  if (parts.length !== 2) return ticker.toLowerCase();
  const [exch, sym] = parts;
  const map = {
    EPA:'.fr', PAR:'.fr', NASDAQ:'.us', NYSE:'.us', NYSEARCA:'.us',
    LON:'.uk', LSE:'.uk', ETR:'.de', FRA:'.de', XETR:'.de',
    AMS:'.nl', BME:'.mc', MIL:'.mi', SWX:'.sw', TSE:'.jp'
  };
  const suffix = map[exch.toUpperCase()] || '.us';
  return sym.toLowerCase() + suffix;
}

function average(arr){ return arr.reduce((a,b) => a+b, 0) / arr.length; }

async function fetchYahooWeekly(symbol){
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=max&interval=1wk`;
  const controller = new AbortController();
  const hardTimeout = setTimeout(() => controller.abort(), 6000);
  try{
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    const result = json && json.chart && json.chart.result && json.chart.result[0];
    if (!result) throw new Error((json && json.chart && json.chart.error && json.chart.error.description) || 'réponse Yahoo Finance invalide');
    const ts = result.timestamp;
    const closes = result.indicators && result.indicators.quote && result.indicators.quote[0] && result.indicators.quote[0].close;
    if (!ts || !closes) throw new Error('données Yahoo Finance incomplètes');

    const dates = [], vals = [];
    for (let i = 0; i < ts.length; i++){
      if (closes[i] == null) continue;
      dates.push(new Date(ts[i] * 1000).toISOString().slice(0, 10));
      vals.push(closes[i]);
    }
    if (vals.length < 10) throw new Error('pas assez de données renvoyées par Yahoo Finance');
    return { dates, closes: vals };
  } finally {
    clearTimeout(hardTimeout);
  }
}

async function fetchStooqWeekly(symbol){
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol)}&i=w&_=${Date.now()}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const text = await res.text();
  if (!text || text.trim().toLowerCase().startsWith('<')) throw new Error('réponse invalide');

  const parsed = Papa.parse(text.trim(), { header: true, skipEmptyLines: true });
  const rows = (parsed.data || []).filter(r => r.Date && r.Close && !isNaN(parseFloat(r.Close)));
  if (rows.length < 10) throw new Error('pas assez de données renvoyées');

  return { dates: rows.map(r => r.Date), closes: rows.map(r => parseFloat(r.Close)) };
}

function setStockSourceNote(text){
  const el = document.getElementById('stockSourceNote');
  if (el) el.textContent = text;
}

async function loadStockChart(ticker){
  const statusEl = document.getElementById('stockStatus');
  const myId = ++stockRequestId;
  stockFull = null;
  if (chartInstances.stock){ chartInstances.stock.destroy(); delete chartInstances.stock; }

  if (!ticker){
    statusEl.textContent = 'Ticker manquant pour cette entreprise, impossible de charger le cours.';
    statusEl.style.display = 'block';
    return;
  }
  statusEl.textContent = 'Chargement du cours…';
  statusEl.style.display = 'block';

  const ySymbol = mapTickerToYahoo(ticker);
  try{
    const { dates, closes } = await fetchYahooWeekly(ySymbol);
    if (myId !== stockRequestId) return;
    const sma = closes.map((_, i) => i < 199 ? null : average(closes.slice(i - 199, i + 1)));
    stockFull = { dates, closes, sma };
    statusEl.style.display = 'none';
    setStockSourceNote('Source : Yahoo Finance (symbole ' + ySymbol + ')');
    renderStockChart();
    return;
  }catch(e){
    if (myId !== stockRequestId) return;
    // Yahoo Finance indisponible (CORS non garanti) — on tente le repli Stooq.
  }

  const sSymbol = mapTickerToStooq(ticker);
  try{
    const res = await fetchStooqWeekly(sSymbol);
    if (myId !== stockRequestId) return;
    const sma = res.closes.map((_, i) => i < 199 ? null : average(res.closes.slice(i - 199, i + 1)));
    stockFull = { dates: res.dates, closes: res.closes, sma };
    statusEl.style.display = 'none';
    setStockSourceNote('Source : Stooq (repli, Yahoo Finance indisponible pour ce ticker — symbole ' + sSymbol + ')');
    renderStockChart();
  }catch(e){
    if (myId !== stockRequestId) return;
    stockFull = null;
    statusEl.textContent = "Cours indisponible pour ce ticker, ni via Yahoo Finance (" + ySymbol + ") ni via Stooq (" + sSymbol + "). Le mapping automatique de la bourse d'origine ne couvre pas forcément tous les cas — dis-moi le bon symbole si besoin.";
    statusEl.style.display = 'block';
  }
}

function renderStockChart(){
  if (!stockFull) return;
  const { dates, closes, sma } = stockFull;
  let startIdx = 0;
  if (stockRange !== 'max'){
    const years = parseInt(stockRange, 10);
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - years);
    const found = dates.findIndex(d => new Date(d) >= cutoff);
    startIdx = found === -1 ? 0 : found;
  }

  const labels = dates.slice(startIdx);
  const dataClose = closes.slice(startIdx);
  const dataSma = sma.slice(startIdx);

  if (chartInstances.stock) chartInstances.stock.destroy();

  const config = {
    type:'line',
    data:{ labels, datasets:[
      { label:'Clôture hebdo', data:dataClose, borderColor:THEME.gold, backgroundColor:'rgba(217,164,65,0.08)', fill:true, tension:0.12, pointRadius:0, borderWidth:1.5 },
      { label:'Moyenne mobile 200 sem.', data:dataSma, borderColor:THEME.blue, borderWidth:1.5, pointRadius:0, spanGaps:true, tension:0.12 }
    ]},
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{position:'bottom', labels:{boxWidth:8, usePointStyle:true}}},
      scales:{
        x:{ grid:{display:false}, ticks:{color:THEME.dim, maxTicksLimit:8}, border:{color:THEME.hair} },
        y:{ grid:baseGrid, ticks:{color:THEME.dim} }
      }
    }
  };
  chartInstances.stock = makeChart('stock', 'chartStock', config);
}

document.getElementById('rangeButtons').addEventListener('click', e => {
  const btn = e.target.closest('button[data-range]');
  if (!btn) return;
  stockRange = btn.dataset.range;
  document.querySelectorAll('#rangeButtons button').forEach(b => b.classList.toggle('active', b === btn));
  renderStockChart();
});

function openZoom(key, title){
  const config = chartConfigs[key];
  if (!config) return;
  document.getElementById('zoomTitle').textContent = title;
  if (window.__zoomChart) window.__zoomChart.destroy();
  window.__zoomChart = new Chart(document.getElementById('zoomCanvas').getContext('2d'), cloneChartConfig(config));
  document.getElementById('zoomModal').style.display = 'flex';
}
function closeZoom(){
  document.getElementById('zoomModal').style.display = 'none';
  if (window.__zoomChart){ window.__zoomChart.destroy(); window.__zoomChart = null; }
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeZoom(); });

function drawGauge(latest){
  const svg = document.getElementById('gaugeSvg');
  const badge = document.getElementById('verdictBadge');
  badge.className = 'gauge-verdict';

  if (latest.prixCible == null || latest.prixJuste == null || latest.prixActuel == null){
    svg.innerHTML = '';
    badge.textContent = 'Données insuffisantes';
    return;
  }

  const W = 1000, H = 90, top = 30, barH = 14;
  const lo = Math.min(latest.prixCible, latest.prixJuste, latest.prixActuel) * 0.85;
  const hi = Math.max(latest.prixCible, latest.prixJuste, latest.prixActuel) * 1.12;
  const x = v => 20 + (v - lo) / (hi - lo) * (W - 40);

  const xCible = x(latest.prixCible);
  const xJuste = x(latest.prixJuste);
  const xActuel = x(latest.prixActuel);

  let html = '';
  html += `<rect x="20" y="${top}" width="${xCible-20}" height="${barH}" rx="7" fill="${THEME.green}" opacity="0.28"/>`;
  html += `<rect x="${xCible}" y="${top}" width="${xJuste-xCible}" height="${barH}" fill="${THEME.gold}" opacity="0.28"/>`;
  html += `<rect x="${xJuste}" y="${top}" width="${W-20-xJuste}" height="${barH}" rx="7" fill="${THEME.red}" opacity="0.28"/>`;
  html += `<rect x="20" y="${top}" width="${W-40}" height="${barH}" rx="7" fill="none" stroke="${THEME.hair}"/>`;

  function marker(xv, label, value, color){
    return `
      <line x1="${xv}" y1="${top-4}" x2="${xv}" y2="${top+barH+4}" stroke="${color}" stroke-width="2"/>
      <circle cx="${xv}" cy="${top+barH/2}" r="4" fill="${color}"/>
      <text x="${xv}" y="${top-10}" text-anchor="middle" fill="${color}" font-size="13" font-weight="700" font-family="JetBrains Mono, monospace">${label}</text>
      <text x="${xv}" y="${top+barH+22}" text-anchor="middle" fill="${THEME.dim}" font-size="12" font-family="JetBrains Mono, monospace">${value.toFixed(1)} €</text>
    `;
  }
  html += marker(xCible, 'CIBLE', latest.prixCible, THEME.green);
  html += marker(xJuste, 'JUSTE', latest.prixJuste, THEME.gold);
  html += marker(xActuel, 'ACTUEL', latest.prixActuel, THEME.red);
  svg.innerHTML = html;

  if (latest.prixActuel > latest.prixJuste){
    badge.textContent = 'Survalorisée';
    badge.classList.add('verdict-over');
  } else if (latest.prixActuel > latest.prixCible){
    badge.textContent = 'Valorisation équitable';
    badge.classList.add('verdict-fair');
  } else {
    badge.textContent = "Zone d'achat";
    badge.classList.add('verdict-under');
  }
}

/* ============================================================
   INIT — on s'assure d'abord que Chart.js est bien chargé
   (avec plusieurs sources de secours si la première est bloquée
   par un bloqueur de publicité ou une restriction réseau),
   puis seulement ensuite on démarre le chargement des données.
   ============================================================ */
function loadScriptOnce(src){
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve(true);
    s.onerror = () => reject(new Error('échec: ' + src));
    document.head.appendChild(s);
  });
}

async function ensureChartJs(){
  if (window.Chart) return true;
  const sources = [
    'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.4/chart.umd.min.js',
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js',
    'https://unpkg.com/chart.js@4.4.4/dist/chart.umd.min.js'
  ];
  for (const src of sources){
    try{
      await loadScriptOnce(src);
      if (window.Chart) return true;
    }catch(e){ /* on essaie la source suivante */ }
  }
  return false;
}

document.getElementById('refreshBtn').addEventListener('click', loadData);
document.querySelectorAll('.page-nav-btn').forEach(btn => {
  btn.addEventListener('click', () => switchPage(btn.dataset.page));
});
initSearch();
initSectorGrid();

(async function init(){
  const ok = await ensureChartJs();
  if (!ok){
    showError("Impossible de charger la librairie de graphiques (Chart.js), quelle que soit la source essayée. C'est presque toujours un bloqueur de publicité, un antivirus ou une restriction réseau qui bloque les CDN (cdnjs.cloudflare.com, jsdelivr.net, unpkg.com). Essaie de désactiver temporairement tes extensions de navigateur, ou ouvre la page en navigation privée.");
    return;
  }
  configureChartDefaults();
  loadData();
})();
```
