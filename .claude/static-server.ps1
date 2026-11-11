param(
  # Instance de TEST : -Port impose un port exact (pas de repli), -IaDir redirige le dossier
  # d'ecriture du Portefeuille IA. Dans les deux cas le fichier .claude\server-port.txt n'est
  # JAMAIS touche (il appartient au raccourci de l'utilisateur), et le dossier reel
  # data\portefeuille-ia n'est jamais utilise si -IaDir est fourni.
  [int]$Port = 0,
  [string]$IaDir = "",
  # Dossier de copies de securite EXTERNE au projet (par defaut : Documents\Wolf Analysis - sauvegardes
  # pour l'instance reelle, aucun pour une instance de test sauf si ce parametre est fourni).
  [string]$ExtBackupDir = "",
  # Dossier des donnees « Mes portefeuilles » (PEA, CTO, Wolf Portfolio) et des multiples saisis. Instance de
  # TEST : passer un dossier jetable, le vrai data\mes-portefeuilles n'est alors jamais touche.
  [string]$StoreDir = ""
)
$root = (Resolve-Path "$PSScriptRoot\..").Path
# Port change 2026-09-08 : 8189 est a son tour passe dans les plages de ports exclues
# par Windows (meme symptome que 8091 le 2026-09-01 et 8137 le 2026-09-05 -
# verifiable via `netsh interface ipv4 show excludedportrange protocol=tcp`) - un
# nouveau processus ne peut plus s'y binder tant que Windows ne liberera pas la plage
# (ces plages sont reservees dynamiquement, notamment par Hyper-V/WSL NAT, et
# reapparaissent avec des ports differents au fil du temps). Ce port a change 4 fois
# maintenant pour la meme raison - plutot que de coder un 5e port en dur "en esperant
# qu'il tienne", le script tente maintenant le port prefere puis, si le bind echoue,
# demande a l'OS un port libre garanti (TcpListener sur le port 0) et l'utilise a la
# place. Le port REELLEMENT utilise est toujours ecrit dans .claude\server-port.txt
# pour que "Lancer Wolf Analysis.bat" puisse le relire et ouvrir la bonne URL, quel
# que soit le port choisi. Ca rend le raccourci Bureau auto-reparant face a cette
# classe de bug Windows, sans intervention manuelle a chaque nouvelle exclusion.
$preferredPort = 8189
$portFile = Join-Path $PSScriptRoot "server-port.txt"
$testInstance = ($Port -gt 0) -or ($IaDir -ne "") -or ($StoreDir -ne "")

function Test-PortBindable($p){
  try{
    $probe = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $p)
    $probe.Start()
    $probe.Stop()
    return $true
  }catch{
    return $false
  }
}

if ($Port -gt 0){
  $port = $Port
}elseif (Test-PortBindable $preferredPort){
  $port = $preferredPort
}else{
  $probe = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, 0)
  $probe.Start()
  $port = $probe.LocalEndpoint.Port
  $probe.Stop()
  Write-Host "Port prefere $preferredPort indisponible (exclu par Windows) - port de secours $port choisi automatiquement."
}

if (-not $testInstance){
  Set-Content -Path $portFile -Value $port -NoNewline -Encoding ascii
}

# Dossier de sauvegarde du Portefeuille IA (voir /api/ia/* plus bas).
if ($IaDir -ne ""){ $iaDirPath = [System.IO.Path]::GetFullPath($IaDir) } else { $iaDirPath = Join-Path $root "data\portefeuille-ia" }
$iaFile = Join-Path $iaDirPath "portefeuilles.json"
$iaBackups = Join-Path $iaDirPath "backups"
$iaStatus = Join-Path $iaDirPath "refresh-status.json"
$iaRequiredKeys = @("chatgpt", "claude", "gemini", "grok")
$iaAllowedKeys = @("chatgpt", "claude", "gemini", "grok", "sp500")
if ($ExtBackupDir -ne ""){ $extBackup = [System.IO.Path]::GetFullPath($ExtBackupDir) }
elseif (-not $testInstance){ $extBackup = Join-Path ([Environment]::GetFolderPath("MyDocuments")) "Wolf Analysis - sauvegardes\portefeuille-ia" }
else { $extBackup = "" }
# « Mes portefeuilles » : un fichier JSON par nom autorise, memes protections que le Portefeuille IA
# (revision, ecriture atomique, copies datees, copie hors projet, aucune operation effacee sans declaration).
if ($StoreDir -ne ""){ $storeDirPath = [System.IO.Path]::GetFullPath($StoreDir) } else { $storeDirPath = Join-Path $root "data\mes-portefeuilles" }
$storeNames = @("portefeuilles", "multiples", "objectifs", "atelier", "prix")
# Publication en ligne (2026-11-10) : copies en LECTURE SEULE servies par le site public (GitHub Pages) quand il n'y a pas de
# serveur local. Une instance de test ecrit dans son propre dossier et ne lance JAMAIS git.
if ($testInstance){ $publicDir = Join-Path $storeDirPath "public-test" } else { $publicDir = Join-Path $root "data\public" }
$publicNames = @("portefeuille-wolf.json", "atelier.json", "prix.json")
$maxPublic = 40MB
# Atelier d'analyses (2026-11-10) : images dans un dossier a part (jamais supprimees par le serveur), cache TradingView.
$atelierMedia = Join-Path $storeDirPath "atelier-media"
$tvCacheDir = Join-Path $storeDirPath "cache-tv"
$maxBodyAtelier = 12MB
$maxMedia = 25MB
if ($StoreDir -ne ""){ $storeExt = "" } elseif (-not $testInstance){ $storeExt = Join-Path ([Environment]::GetFolderPath("MyDocuments")) "Wolf Analysis - sauvegardes\mes-portefeuilles" } else { $storeExt = "" }
$maxBody = 2MB
$rootWithSep = $root.TrimEnd('\') + '\'
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()
Write-Host "Serving $root on http://localhost:$port/  (IA dir: $iaDirPath, store: $storeDirPath)"

$mime = @{
  ".html" = "text/html"; ".htm" = "text/html"; ".css" = "text/css"; ".js" = "application/javascript";
  ".json" = "application/json"; ".png" = "image/png"; ".jpg" = "image/jpeg"; ".jpeg" = "image/jpeg";
  ".svg" = "image/svg+xml"; ".ico" = "image/x-icon"; ".woff" = "font/woff"; ".woff2" = "font/woff2"; ".pdf" = "application/pdf"; ".webmanifest" = "application/manifest+json";
}

function Send-Json($res, [int]$code, $obj){
  $res.StatusCode = $code
  $res.ContentType = "application/json; charset=utf-8"
  $res.Headers.Add("Cache-Control", "no-cache, no-store, must-revalidate")
  $bytes = $utf8NoBom.GetBytes(($obj | ConvertTo-Json -Depth 6 -Compress))
  $res.ContentLength64 = $bytes.Length
  $res.OutputStream.Write($bytes, 0, $bytes.Length)
}

# Garde-fous communs aux endpoints d'ecriture (/api/ia/save, /api/ia/refresh). Une page web
# quelconque ouverte dans le navigateur de l'utilisateur pourrait tenter un POST vers
# localhost : un en-tete personnalise + Content-Type json forcent une requete "preflight"
# CORS que ce serveur ne valide jamais (donc bloquee par le navigateur), et l'en-tete Origin
# doit etre exactement celui de cette instance.
function Test-WriteGuards($req, $res){
  if ($req.HttpMethod -ne "POST"){ Send-Json $res 405 @{ ok = $false; error = "POST requis" }; return $false }
  if ($req.Headers["X-Wolf-IA"] -ne "1"){ Send-Json $res 403 @{ ok = $false; error = "en-tete manquant" }; return $false }
  $origin = $req.Headers["Origin"]
  if ($origin -and $origin -ne "http://localhost:$port"){ Send-Json $res 403 @{ ok = $false; error = "origine refusee" }; return $false }
  if (-not ($req.ContentType -like "application/json*")){ Send-Json $res 415 @{ ok = $false; error = "application/json requis" }; return $false }
  return $true
}

function Read-BodyBytes($req, $res, $limit = 0){
  if ($limit -le 0){ $limit = $maxBody }
  $len = $req.ContentLength64
  if ($len -lt 0){ Send-Json $res 411 @{ ok = $false; error = "longueur requise" }; return $null }
  if ($len -gt $limit){ Send-Json $res 413 @{ ok = $false; error = "corps trop volumineux" }; return $null }
  $ms = New-Object System.IO.MemoryStream
  $req.InputStream.CopyTo($ms)
  return $ms.ToArray()
}

function Get-TradeIds($state, $key){
  $p = $state.portfolios.$key
  if (-not $p -or -not $p.trades){ return @() }
  return @($p.trades | ForEach-Object { [string]$_.id })
}

function Handle-IaSave($req, $res){
  if (-not (Test-WriteGuards $req $res)){ return }
  $bytes = Read-BodyBytes $req $res
  if ($null -eq $bytes){ return }
  # Decodage UTF-8 STRICT : les octets recus sont ecrits tels quels dans le fichier, un corps
  # mal encode corromprait donc les accents de facon irreversible - on le refuse.
  try { $text = (New-Object System.Text.UTF8Encoding($false, $true)).GetString($bytes) } catch { Send-Json $res 400 @{ ok = $false; error = "encodage UTF-8 invalide" }; return }
  try { $b = $text | ConvertFrom-Json } catch { Send-Json $res 400 @{ ok = $false; error = "JSON invalide" }; return }
  if (-not $b -or $b.version -ne 1 -or -not $b.portfolios){ Send-Json $res 400 @{ ok = $false; error = "schema inconnu" }; return }
  $names = @($b.portfolios.PSObject.Properties.Name)
  foreach ($k in $iaRequiredKeys){ if ($names -notcontains $k){ Send-Json $res 400 @{ ok = $false; error = "portefeuille manquant : $k" }; return } }
  foreach ($n in $names){ if ($iaAllowedKeys -notcontains $n){ Send-Json $res 400 @{ ok = $false; error = "portefeuille inconnu : $n" }; return } }
  foreach ($k in $iaAllowedKeys){
    foreach ($t in @($b.portfolios.$k.trades | Where-Object { $null -ne $_ })){
      if (-not $t.id -or ($t.type -ne "BUY" -and $t.type -ne "SELL" -and $t.type -ne "DIV") -or -not $t.symbol -or ("$($t.date)" -notmatch '^\d{4}-\d{2}-\d{2}$')){
        Send-Json $res 400 @{ ok = $false; error = "operation invalide dans $k" }; return
      }
    }
  }
  $curRevision = 0
  $cur = $null
  if (Test-Path $iaFile -PathType Leaf){
    try { $cur = [System.IO.File]::ReadAllText($iaFile, $utf8NoBom) | ConvertFrom-Json } catch { $cur = $null }
    if ($cur -and $cur.revision){ $curRevision = [int]$cur.revision }
    if ($null -eq $cur){ Send-Json $res 500 @{ ok = $false; error = "fichier actuel illisible - ecriture refusee par prudence" }; return }
  }
  if ([int]$b.baseRevision -ne $curRevision){ Send-Json $res 409 @{ ok = $false; error = "revision perimee"; revision = $curRevision }; return }
  if ([int]$b.revision -ne ($curRevision + 1)){ Send-Json $res 400 @{ ok = $false; error = "revision incoherente" }; return }
  # Invariant anti-perte (esprit de l'incident VINCI) : aucune operation deja enregistree ne peut
  # disparaitre SAUF si le client la declare explicitement dans "deleted" (suppression voulue par
  # l'utilisateur, 2 clics). Une sauvegarde d'un onglet perime ou bugue ne peut donc pas effacer
  # d'operations par accident. Toute suppression force une copie datee (voir plus bas).
  $removedAny = $false
  if ($cur){
    $declared = @($b.deleted | ForEach-Object { [string]$_ })
    foreach ($k in $iaAllowedKeys){
      $newIds = Get-TradeIds $b $k
      $missing = @(Get-TradeIds $cur $k | Where-Object { $newIds -notcontains $_ })
      $undeclared = @($missing | Where-Object { $declared -notcontains $_ })
      if ($undeclared.Count -gt 0){ Send-Json $res 400 @{ ok = $false; error = "operation(s) supprimee(s) non declaree(s) dans $k" }; return }
      if ($missing.Count -gt 0){ $removedAny = $true }
    }
  }
  New-Item -ItemType Directory -Force -Path $iaDirPath | Out-Null
  Ensure-MonthlySnapshot $iaFile "portefeuilles-ia" @($iaDirPath, $extBackup)
  # Copie datee de la version precedente (au plus une par 10 min, 300 conservees).
  if ($cur){
    New-Item -ItemType Directory -Force -Path $iaBackups | Out-Null
    $last = Get-ChildItem $iaBackups -Filter "portefeuilles-*.json" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($removedAny -or -not $last -or ((Get-Date) - $last.LastWriteTime).TotalMinutes -ge 10){
      Copy-Item $iaFile (Join-Path $iaBackups ("portefeuilles-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".json"))
      $old = @(Get-ChildItem $iaBackups -Filter "portefeuilles-*.json" | Sort-Object LastWriteTime -Descending | Select-Object -Skip 300)
      foreach ($f in $old){ Remove-Item $f.FullName -ErrorAction SilentlyContinue }
    }
  }
  # Ecriture atomique : fichier temporaire puis remplacement. [NullString]::Value est
  # indispensable : en PowerShell un simple $null devient une chaine vide pour .NET, ce qui
  # fait lever une exception a File.Replace (constate en test).
  $tmp = $iaFile + ".tmp"
  try {
    [System.IO.File]::WriteAllBytes($tmp, $bytes)
    if (Test-Path $iaFile -PathType Leaf){ [System.IO.File]::Replace($tmp, $iaFile, [NullString]::Value) } else { [System.IO.File]::Move($tmp, $iaFile) }
  } catch {
    Remove-Item $tmp -ErrorAction SilentlyContinue
    Send-Json $res 500 @{ ok = $false; error = "ecriture impossible" }; return
  }
  # Copie de securite HORS du projet (Documents) : "derniere" a chaque enregistrement + une copie par jour
  # (300 jours conserves). Protege contre toute operation sur le depot ou le dossier de l'appli.
  if ($extBackup -ne ""){
    try {
      New-Item -ItemType Directory -Force -Path $extBackup | Out-Null
      Copy-Item $iaFile (Join-Path $extBackup "portefeuilles-derniere.json") -Force
      Copy-Item $iaFile (Join-Path $extBackup ("portefeuilles-" + (Get-Date -Format "yyyyMMdd") + ".json")) -Force
      $oldExt = @(Get-ChildItem $extBackup -Filter "portefeuilles-2*.json" | Sort-Object Name -Descending | Select-Object -Skip 300)
      foreach ($f in $oldExt){ Remove-Item $f.FullName -ErrorAction SilentlyContinue }
    } catch { }
  }
  Send-Json $res 200 @{ ok = $true; revision = [int]$b.revision; savedAt = (Get-Date).ToString("o") }
}

function Handle-IaRefresh($req, $res){
  if (-not (Test-WriteGuards $req $res)){ return }
  # Refuse si un rafraichissement tourne deja (ou vient de finir).
  if (Test-Path $iaStatus -PathType Leaf){
    try {
      $st = [System.IO.File]::ReadAllText($iaStatus, $utf8NoBom) | ConvertFrom-Json
      $age = ((Get-Date) - (Get-Item $iaStatus).LastWriteTime).TotalSeconds
      if ($st.state -eq "running" -and $age -lt 900){ Send-Json $res 409 @{ ok = $false; error = "rafraichissement deja en cours" }; return }
      if ($age -lt 60 -and $st.state -ne "error"){ Send-Json $res 429 @{ ok = $false; error = "patiente une minute entre deux rafraichissements" }; return }
    } catch { }
  }
  New-Item -ItemType Directory -Force -Path $iaDirPath | Out-Null
  $script = Join-Path $root "fmp-database\refresh_portfolio_ia.py"
  if (-not (Test-Path $script -PathType Leaf)){ Send-Json $res 500 @{ ok = $false; error = "script de rafraichissement introuvable" }; return }
  $python = (Get-Command python -ErrorAction SilentlyContinue).Source
  if (-not $python){ $python = (Get-Command py -ErrorAction SilentlyContinue).Source }
  if (-not $python){ Send-Json $res 500 @{ ok = $false; error = "Python introuvable" }; return }
  $init = @{ state = "running"; startedAt = (Get-Date).ToString("o"); done = 0; total = 0; current = ""; errors = @() } | ConvertTo-Json -Compress
  [System.IO.File]::WriteAllText($iaStatus, $init, $utf8NoBom)
  try {
    Start-Process -FilePath $python -ArgumentList @("`"$script`"", "--ia-dir", "`"$iaDirPath`"") -WorkingDirectory (Join-Path $root "fmp-database") -WindowStyle Hidden | Out-Null
  } catch {
    $err = @{ state = "error"; message = "lancement impossible" } | ConvertTo-Json -Compress
    [System.IO.File]::WriteAllText($iaStatus, $err, $utf8NoBom)
    Send-Json $res 500 @{ ok = $false; error = "lancement impossible" }; return
  }
  Send-Json $res 202 @{ ok = $true; state = "running" }
}

# Cours en direct : le serveur interroge Yahoo Finance lui-meme (pas de CORS cote serveur, et bien
# plus fiable que les relais gratuits du navigateur). Lecture seule, symbole strictement valide.
function Handle-IaQuote($req, $res){
  if ($req.HttpMethod -ne "GET"){ Send-Json $res 405 @{ ok = $false; error = "GET requis" }; return }
  $sym = $req.QueryString["symbol"]
  if (-not $sym -or $sym -notmatch '^[A-Za-z0-9.^=\-]{1,24}$'){ Send-Json $res 400 @{ ok = $false; error = "symbole invalide" }; return }
  $url = "https://query1.finance.yahoo.com/v8/finance/chart/" + [System.Uri]::EscapeDataString($sym) + "?range=5d&interval=1d"
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Headers @{ "User-Agent" = "Mozilla/5.0" } -TimeoutSec 8 -Uri $url
    $m = ($r.Content | ConvertFrom-Json).chart.result[0].meta
    $price = [double]$m.regularMarketPrice
    if ($price -le 0){ Send-Json $res 502 @{ ok = $false; error = "cours indisponible" }; return }
    $inv = [System.Globalization.CultureInfo]::InvariantCulture
    $ccy = ([string]$m.currency) -replace '[^A-Za-z]', ''
    $json = '{"ok":true,"price":' + $price.ToString("R", $inv) + ',"currency":"' + $ccy + '","time":' + ([long]$m.regularMarketTime) + '}'
    $bytes = $utf8NoBom.GetBytes($json)
    $res.StatusCode = 200
    $res.ContentType = "application/json; charset=utf-8"
    $res.Headers.Add("Cache-Control", "no-cache, no-store, must-revalidate")
    $res.ContentLength64 = $bytes.Length
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
  } catch {
    Send-Json $res 502 @{ ok = $false; error = "Yahoo injoignable" }
  }
}

# TradingView (donnees publiques du site, lecture seule) : recherche d'actions pour l'autocompletion et
# instantane de ratios d'une entreprise absente de la liste suivie. Le navigateur ne peut pas les appeler
# directement (CORS) : c'est le serveur local qui s'en charge. Symboles et texte strictement valides.
function Send-RawJsonString($res, $json){
  $bytes = $utf8NoBom.GetBytes($json)
  $res.StatusCode = 200
  $res.ContentType = "application/json; charset=utf-8"
  $res.Headers.Add("Cache-Control", "no-cache, no-store, must-revalidate")
  $res.ContentLength64 = $bytes.Length
  $res.OutputStream.Write($bytes, 0, $bytes.Length)
}
function Get-TvText($url, $headers){
  $r = Invoke-WebRequest -UseBasicParsing -Headers $headers -TimeoutSec 10 -Uri $url
  return [System.Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray())
}
function Handle-TvSearch($req, $res){
  if ($req.HttpMethod -ne "GET"){ Send-Json $res 405 @{ ok = $false; error = "GET requis" }; return }
  $q = $req.QueryString["q"]
  if (-not $q -or $q.Length -gt 60 -or $q -match '[ -]'){ Send-Json $res 400 @{ ok = $false; error = "recherche invalide" }; return }
  # all=1 (onglet Mes portefeuilles) : actions ET fonds/ETF ; sinon actions seulement (recherche de l'onglet Analyse).
  $allTypes = ($req.QueryString["all"] -eq "1")
  $stype = "stock"; if ($allTypes){ $stype = "" }
  $url = "https://symbol-search.tradingview.com/symbol_search/v3/?text=" + [System.Uri]::EscapeDataString($q) + "&hl=0&lang=fr&search_type=" + $stype + "&domain=production"
  try {
    $txt = Get-TvText $url @{ "User-Agent" = "Mozilla/5.0"; "Origin" = "https://www.tradingview.com"; "Referer" = "https://www.tradingview.com/" }
    $j = $txt | ConvertFrom-Json
    $items = @()
    foreach ($s in $j.symbols){
      if ($items.Count -ge 10){ break }
      if ($s.type -ne "stock" -and $s.type -ne "dr" -and -not ($allTypes -and $s.type -eq "fund")){ continue }
      $ex = [string]$s.prefix
      if (-not $ex){ $ex = [string]$s.source_id }
      $items += @{ symbol = ($ex + ":" + [string]$s.symbol); name = [string]$s.description; exchange = [string]$s.exchange; currency = [string]$s.currency_code; country = [string]$s.country; type = [string]$s.type; logoid = [string]$s.logoid }
    }
    Send-Json $res 200 @{ ok = $true; results = $items }
  } catch {
    Send-Json $res 502 @{ ok = $false; error = "TradingView injoignable" }
  }
}
function Handle-TvSnapshot($req, $res){
  if ($req.HttpMethod -ne "GET"){ Send-Json $res 405 @{ ok = $false; error = "GET requis" }; return }
  $sym = $req.QueryString["symbol"]
  if (-not $sym -or $sym -notmatch '^[A-Za-z0-9_.!&-]{1,24}:[A-Za-z0-9_.!&-]{1,24}$'){ Send-Json $res 400 @{ ok = $false; error = "symbole invalide" }; return }
  $cols = "description,currency,exchange,sector,industry,close,market_cap_basic,price_earnings_ttm,earnings_per_share_diluted_ttm,price_free_cash_flow_ttm,free_cash_flow_per_share_ttm,free_cash_flow_ttm,neg_capital_expenditures_ttm,total_revenue_ttm,dps_common_stock_prim_issue_fy,dividends_yield,return_on_invested_capital_fy,operating_margin,total_shares_outstanding_fundamental,cash_n_short_term_invest_fq,net_debt_fq,logoid,fundamental_currency_code,ebitda_ttm,ebitda_fy,ebitda_fy_h,total_debt_fq,book_value_per_share_fq,enterprise_value_ebitda_ttm,enterprise_value_ebitda_current,price_book_fq"
  $url = "https://scanner.tradingview.com/symbol?symbol=" + [System.Uri]::EscapeDataString($sym) + "&fields=" + $cols + "&no_404=true"
  # Cache disque (2026-11-10) : chaque reponse reussie est gardee ; cached=1 = reponse immediate depuis le cache s'il existe ;
  # si TradingView ne repond pas (2 essais), la derniere reponse connue est renvoyee avec "stale":true (jamais un ecran vide).
  $cf = Join-Path $tvCacheDir (($sym -replace '[^A-Za-z0-9_.-]', '_') + ".json")
  if ($req.QueryString["cached"] -eq "1" -and (Test-Path $cf -PathType Leaf)){
    try {
      $c = [System.IO.File]::ReadAllText($cf, $utf8NoBom)
      $at = (Get-Item $cf).LastWriteTimeUtc.ToString("o")
      Send-RawJsonString $res ('{"ok":true,"symbol":"' + $sym + '","cached":true,"at":"' + $at + '","data":' + $c + '}'); return
    } catch { }
  }
  $txt = $null; $unknown = $false
  foreach ($try in 1..2){
    try {
      $t = Get-TvText $url @{ "User-Agent" = "Mozilla/5.0" }
      if (-not $t -or $t.Trim().Length -lt 3 -or $t.Trim() -eq "{}"){ $unknown = $true; break }
      $t = $t.Trim()
      if ($t.StartsWith("{")){ $txt = $t; break }
    } catch { }
    Start-Sleep -Milliseconds 400
  }
  if ($txt){
    try { New-Item -ItemType Directory -Force -Path $tvCacheDir | Out-Null; [System.IO.File]::WriteAllText($cf, $txt, $utf8NoBom) } catch { }
    Send-RawJsonString $res ('{"ok":true,"symbol":"' + $sym + '","data":' + $txt + '}'); return
  }
  if (Test-Path $cf -PathType Leaf){
    try {
      $c = [System.IO.File]::ReadAllText($cf, $utf8NoBom)
      $at = (Get-Item $cf).LastWriteTimeUtc.ToString("o")
      Send-RawJsonString $res ('{"ok":true,"symbol":"' + $sym + '","stale":true,"at":"' + $at + '","data":' + $c + '}'); return
    } catch { }
  }
  if ($unknown){ Send-Json $res 404 @{ ok = $false; error = "symbole inconnu de TradingView" }; return }
  Send-Json $res 502 @{ ok = $false; error = "TradingView injoignable" }
}
# Memoire des fiches TradingView deja demandees (noms -> symboles, dernieres fiches) : un FICHIER, pour ne plus dependre du
# stockage du navigateur (perdu a chaque changement de port). Le client fusionne puis renvoie l'ensemble.
function Handle-TvMemo($req, $res){
  $f = Join-Path $tvCacheDir "memo.json"
  if ($req.HttpMethod -eq "GET"){
    if (-not (Test-Path $f -PathType Leaf)){ Send-RawJsonString $res '{"ok":true,"data":null}'; return }
    try { Send-RawJsonString $res ('{"ok":true,"data":' + [System.IO.File]::ReadAllText($f, $utf8NoBom) + '}') } catch { Send-RawJsonString $res '{"ok":true,"data":null}' }
    return
  }
  if (-not (Test-WriteGuards $req $res)){ return }
  $bytes = Read-BodyBytes $req $res $maxBodyAtelier
  if ($null -eq $bytes){ return }
  try { $text = (New-Object System.Text.UTF8Encoding($false, $true)).GetString($bytes); $b = $text | ConvertFrom-Json } catch { Send-Json $res 400 @{ ok = $false; error = "JSON invalide" }; return }
  if (-not $b -or $null -eq $b.symbols -or $null -eq $b.onDemand){ Send-Json $res 400 @{ ok = $false; error = "schema inconnu" }; return }
  try {
    New-Item -ItemType Directory -Force -Path $tvCacheDir | Out-Null
    $tmp = $f + ".tmp"
    [System.IO.File]::WriteAllBytes($tmp, $bytes)
    if (Test-Path $f -PathType Leaf){ [System.IO.File]::Replace($tmp, $f, [NullString]::Value) } else { [System.IO.File]::Move($tmp, $f) }
    Send-Json $res 200 @{ ok = $true }
  } catch { Send-Json $res 500 @{ ok = $false; error = "ecriture impossible" } }
}
# Publication : 1) /api/publish/file?name=... recoit chaque copie telle quelle (preparee par l'appli : Wolf Portfolio seul,
# jamais PEA ni CTO) ; 2) /api/publish/go copie les images citees et les donnees de l'onglet Analyse, puis envoie sur GitHub.
function Handle-PublishFile($req, $res){
  if (-not (Test-WriteGuards $req $res)){ return }
  $n = [string]$req.QueryString["name"]
  if ($publicNames -notcontains $n){ Send-Json $res 400 @{ ok = $false; error = "nom de fichier inconnu" }; return }
  $bytes = Read-BodyBytes $req $res $maxPublic
  if ($null -eq $bytes){ return }
  if ($bytes.Length -lt 2 -or $bytes[0] -ne 123){ Send-Json $res 400 @{ ok = $false; error = "JSON attendu" }; return }
  try {
    New-Item -ItemType Directory -Force -Path $publicDir | Out-Null
    $f = Join-Path $publicDir $n; $tmp = $f + ".tmp"
    [System.IO.File]::WriteAllBytes($tmp, $bytes)
    if (Test-Path $f -PathType Leaf){ [System.IO.File]::Replace($tmp, $f, [NullString]::Value) } else { [System.IO.File]::Move($tmp, $f) }
    Send-Json $res 200 @{ ok = $true }
  } catch { Send-Json $res 500 @{ ok = $false; error = "ecriture impossible" } }
}
function Handle-PublishGo($req, $res){
  if (-not (Test-WriteGuards $req $res)){ return }
  $bytes = Read-BodyBytes $req $res
  if ($null -eq $bytes){ return }
  try { $b = (New-Object System.Text.UTF8Encoding($false, $true)).GetString($bytes) | ConvertFrom-Json } catch { Send-Json $res 400 @{ ok = $false; error = "JSON invalide" }; return }
  try {
    New-Item -ItemType Directory -Force -Path (Join-Path $publicDir "media") | Out-Null
    $nMedia = 0
    foreach ($m in @($b.media)){
      $name = [string]$m
      if ($name -notmatch '^[a-z0-9-]{8,60}\.(png|jpg|webp|gif|pdf)$'){ continue }
      $src = Join-Path $atelierMedia $name; $dst = Join-Path $publicDir ("media\" + $name)
      if ((Test-Path $src -PathType Leaf) -and -not (Test-Path $dst -PathType Leaf)){ Copy-Item $src $dst }
      if (Test-Path $dst -PathType Leaf){ $nMedia++ }
    }
    $tv = Join-Path $root "data\tv-analyse.json"
    $tvOk = $false
    if ($b.tv -and (Test-Path $tv -PathType Leaf)){ Copy-Item $tv (Join-Path $publicDir "tv-analyse.json") -Force; $tvOk = $true }
    $stamp = (Get-Date).ToString("o")
    [System.IO.File]::WriteAllText((Join-Path $publicDir "info.json"), ('{"at":"' + $stamp + '"}'), $utf8NoBom)
  } catch { Send-Json $res 500 @{ ok = $false; error = "preparation impossible" }; return }
  if ($testInstance){ Send-Json $res 200 @{ ok = $true; test = $true; media = $nMedia; tv = $tvOk; dir = $publicDir }; return }
  $git = (Get-Command git -ErrorAction SilentlyContinue).Source
  if (-not $git){ Send-Json $res 500 @{ ok = $false; error = "git introuvable sur ce PC" }; return }
  $env:GIT_TERMINAL_PROMPT = "0"
  $log = ""
  try {
    $log += (& $git -C $root add -- "data/public" 2>&1 | Out-String)
    $pending = (& $git -C $root status --porcelain -- "data/public" 2>&1 | Out-String).Trim()
    if ($pending){ $log += (& $git -C $root commit -m ("Publication en ligne du " + (Get-Date -Format "dd/MM/yyyy HH:mm")) -- "data/public" 2>&1 | Out-String) }
    $push = (& $git -C $root push origin HEAD 2>&1 | Out-String)
    $pushed = ($LASTEXITCODE -eq 0)
    $log += $push
    if (-not $pushed){ Send-Json $res 502 @{ ok = $false; error = "envoi sur GitHub refuse ou impossible"; log = $log }; return }
    Send-Json $res 200 @{ ok = $true; media = $nMedia; tv = $tvOk; changed = [bool]$pending; at = $stamp }
  } catch { Send-Json $res 500 @{ ok = $false; error = "git a echoue"; log = $log } }
}
# Images de l'Atelier d'analyses : un fichier par image, nom genere ici, JAMAIS supprime ni ecrase par le serveur.
function Handle-AtelierMedia($req, $res){
  if ($req.HttpMethod -eq "GET"){
    $n = [string]$req.QueryString["f"]
    if ($n -notmatch '^[a-z0-9-]{8,60}\.(png|jpg|webp|gif|pdf)$'){ Send-Json $res 400 @{ ok = $false; error = "nom invalide" }; return }
    $p = Join-Path $atelierMedia $n
    if (-not (Test-Path $p -PathType Leaf)){ $res.StatusCode = 404; return }
    $ext = [System.IO.Path]::GetExtension($p)
    $ctOut = $mime[$ext]; if ($ext -eq ".webp"){ $ctOut = "image/webp" } elseif ($ext -eq ".gif"){ $ctOut = "image/gif" } elseif ($ext -eq ".pdf"){ $ctOut = "application/pdf" }
    $res.ContentType = $ctOut
    $res.Headers.Add("Cache-Control", "private, max-age=31536000, immutable")
    $res.Headers.Add("X-Content-Type-Options", "nosniff")
    $bytes = [System.IO.File]::ReadAllBytes($p)
    $res.ContentLength64 = $bytes.Length
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
    return
  }
  if ($req.HttpMethod -ne "POST"){ Send-Json $res 405 @{ ok = $false; error = "POST requis" }; return }
  if ($req.Headers["X-Wolf-IA"] -ne "1"){ Send-Json $res 403 @{ ok = $false; error = "en-tete manquant" }; return }
  $origin = $req.Headers["Origin"]
  if ($origin -and $origin -ne "http://localhost:$port"){ Send-Json $res 403 @{ ok = $false; error = "origine refusee" }; return }
  $extMap = @{ "image/png" = "png"; "image/jpeg" = "jpg"; "image/webp" = "webp"; "image/gif" = "gif"; "application/pdf" = "pdf" }
  $ct = ([string]$req.ContentType).Split(';')[0].Trim().ToLower()
  $e = $extMap[$ct]
  if (-not $e){ Send-Json $res 415 @{ ok = $false; error = "format non pris en charge (png, jpg, webp, gif, pdf)" }; return }
  $bytes = Read-BodyBytes $req $res $maxMedia
  if ($null -eq $bytes){ return }
  if ($bytes.Length -lt 16){ Send-Json $res 400 @{ ok = $false; error = "image vide" }; return }
  $name = (Get-Date -Format "yyyyMMdd-HHmmss") + "-" + ([Guid]::NewGuid().ToString("N").Substring(0, 10)) + "." + $e
  try {
    New-Item -ItemType Directory -Force -Path $atelierMedia | Out-Null
    [System.IO.File]::WriteAllBytes((Join-Path $atelierMedia $name), $bytes)
    if ($storeExt -ne ""){
      try { $em = Join-Path $storeExt "atelier-media"; New-Item -ItemType Directory -Force -Path $em | Out-Null; [System.IO.File]::WriteAllBytes((Join-Path $em $name), $bytes) } catch { }
    }
    Send-Json $res 200 @{ ok = $true; file = $name }
  } catch { Send-Json $res 500 @{ ok = $false; error = "ecriture impossible" } }
}

# ---------------- Copie MENSUELLE (2026-11-08, demande de l'utilisateur : « une copie tous les premiers du mois ») ----------------
# Le premier accès d'un nouveau mois (démarrage du serveur, lecture ou enregistrement) fige l'état du fichier AVANT toute
# modification du mois, dans <dossier>\mensuel\<nom>-AAAA-MM.json ET dans la copie hors projet (Documents). Jamais purgées :
# c'est l'historique long terme. Une copie existante n'est jamais réécrite.
function Ensure-MonthlySnapshot($src, $name, $dirs){
  if (-not (Test-Path $src -PathType Leaf)){ return }
  $stamp = Get-Date -Format "yyyy-MM"
  foreach ($d in $dirs){
    if (-not $d){ continue }
    try {
      $m = Join-Path $d "mensuel"
      $dst = Join-Path $m ($name + "-" + $stamp + ".json")
      if (-not (Test-Path $dst -PathType Leaf)){
        New-Item -ItemType Directory -Force -Path $m | Out-Null
        Copy-Item $src $dst
      }
    } catch { }
  }
}
function Ensure-AllMonthlySnapshots(){
  foreach ($n in $storeNames){ Ensure-MonthlySnapshot (Join-Path $storeDirPath ($n + ".json")) $n @($storeDirPath, $storeExt) }
  Ensure-MonthlySnapshot $iaFile "portefeuilles-ia" @($iaDirPath, $extBackup)
}

# ---------------- « Mes portefeuilles » : stockage fichier + historique TradingView ----------------
function Get-StoreName($req, $res){
  $n = $req.QueryString["name"]
  if (-not $n -or $storeNames -notcontains $n){ Send-Json $res 400 @{ ok = $false; error = "nom de fichier inconnu" }; return $null }
  return $n
}
# Identifiants de toutes les operations (accounts.<compte>.ops[].id) : aucune ne doit disparaitre sans etre declaree.
function Get-StoreOpIds($state){
  $ids = @()
  if ($state -and $state.accounts){
    foreach ($p in $state.accounts.PSObject.Properties){ if ($p.Value.ops){ $ids += @($p.Value.ops | ForEach-Object { [string]$_.id }) } }
  }
  return $ids
}
function Handle-StoreLoad($req, $res){
  $n = Get-StoreName $req $res; if (-not $n){ return }
  $f = Join-Path $storeDirPath ($n + ".json")
  Ensure-MonthlySnapshot $f $n @($storeDirPath, $storeExt)
  if (-not (Test-Path $f -PathType Leaf)){ Send-RawJsonString $res '{"ok":true,"data":null}'; return }
  $txt = [System.IO.File]::ReadAllText($f, $utf8NoBom)
  Send-RawJsonString $res ('{"ok":true,"file":' + (ConvertTo-Json $f -Compress) + ',"data":' + $txt + '}')
}
function Handle-StoreSave($req, $res){
  if (-not (Test-WriteGuards $req $res)){ return }
  $n = Get-StoreName $req $res; if (-not $n){ return }
  $lim = 0; if ($n -eq "atelier"){ $lim = $maxBodyAtelier }
  $bytes = Read-BodyBytes $req $res $lim
  if ($null -eq $bytes){ return }
  try { $text = (New-Object System.Text.UTF8Encoding($false, $true)).GetString($bytes) } catch { Send-Json $res 400 @{ ok = $false; error = "encodage UTF-8 invalide" }; return }
  try { $b = $text | ConvertFrom-Json } catch { Send-Json $res 400 @{ ok = $false; error = "JSON invalide" }; return }
  if (-not $b -or $b.version -ne 1){ Send-Json $res 400 @{ ok = $false; error = "schema inconnu" }; return }
  if ($n -eq "atelier" -and $null -eq $b.docs){ Send-Json $res 400 @{ ok = $false; error = "schema inconnu" }; return }
  $f = Join-Path $storeDirPath ($n + ".json")
  $bk = Join-Path $storeDirPath "backups"
  $cur = $null; $curRevision = 0
  if (Test-Path $f -PathType Leaf){
    try { $cur = [System.IO.File]::ReadAllText($f, $utf8NoBom) | ConvertFrom-Json } catch { $cur = $null }
    if ($null -eq $cur){ Send-Json $res 500 @{ ok = $false; error = "fichier actuel illisible - ecriture refusee par prudence" }; return }
    if ($cur.revision){ $curRevision = [int]$cur.revision }
  }
  if ([int]$b.baseRevision -ne $curRevision){ Send-Json $res 409 @{ ok = $false; error = "revision perimee"; revision = $curRevision }; return }
  if ([int]$b.revision -ne ($curRevision + 1)){ Send-Json $res 400 @{ ok = $false; error = "revision incoherente" }; return }
  $removedAny = $false
  if ($cur -and $n -eq "portefeuilles"){
    $declared = @($b.deleted | ForEach-Object { [string]$_ })
    $newIds = Get-StoreOpIds $b
    $missing = @(Get-StoreOpIds $cur | Where-Object { $newIds -notcontains $_ })
    $undeclared = @($missing | Where-Object { $declared -notcontains $_ })
    if ($undeclared.Count -gt 0){ Send-Json $res 400 @{ ok = $false; error = "operation(s) supprimee(s) non declaree(s)" }; return }
    if ($missing.Count -gt 0){ $removedAny = $true }
  }
  # Atelier : aucun dossier (docs.<id>) ne disparait sans etre declare dans deleted ; toute disparition force une copie datee.
  if ($cur -and $n -eq "atelier" -and $cur.docs){
    $declared = @($b.deleted | ForEach-Object { [string]$_ })
    $newIds = @($b.docs.PSObject.Properties | ForEach-Object { $_.Name })
    $missing = @($cur.docs.PSObject.Properties | ForEach-Object { $_.Name } | Where-Object { $newIds -notcontains $_ })
    $undeclared = @($missing | Where-Object { $declared -notcontains $_ })
    if ($undeclared.Count -gt 0){ Send-Json $res 400 @{ ok = $false; error = "dossier(s) supprime(s) non declare(s)" }; return }
    if ($missing.Count -gt 0){ $removedAny = $true }
  }
  New-Item -ItemType Directory -Force -Path $storeDirPath | Out-Null
  Ensure-MonthlySnapshot $f $n @($storeDirPath, $storeExt)
  if ($cur){
    New-Item -ItemType Directory -Force -Path $bk | Out-Null
    $last = Get-ChildItem $bk -Filter ($n + "-*.json") -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($removedAny -or -not $last -or ((Get-Date) - $last.LastWriteTime).TotalMinutes -ge 10){
      Copy-Item $f (Join-Path $bk ($n + "-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".json"))
      $old = @(Get-ChildItem $bk -Filter ($n + "-*.json") | Sort-Object LastWriteTime -Descending | Select-Object -Skip 300)
      foreach ($o in $old){ Remove-Item $o.FullName -ErrorAction SilentlyContinue }
    }
  }
  $tmp = $f + ".tmp"
  try {
    [System.IO.File]::WriteAllBytes($tmp, $bytes)
    if (Test-Path $f -PathType Leaf){ [System.IO.File]::Replace($tmp, $f, [NullString]::Value) } else { [System.IO.File]::Move($tmp, $f) }
  } catch {
    Remove-Item $tmp -ErrorAction SilentlyContinue
    Send-Json $res 500 @{ ok = $false; error = "ecriture impossible" }; return
  }
  if ($storeExt -ne ""){
    try {
      New-Item -ItemType Directory -Force -Path $storeExt | Out-Null
      Copy-Item $f (Join-Path $storeExt ($n + "-derniere.json")) -Force
      Copy-Item $f (Join-Path $storeExt ($n + "-" + (Get-Date -Format "yyyyMMdd") + ".json")) -Force
      $oldExt = @(Get-ChildItem $storeExt -Filter ($n + "-2*.json") | Sort-Object Name -Descending | Select-Object -Skip 300)
      foreach ($o in $oldExt){ Remove-Item $o.FullName -ErrorAction SilentlyContinue }
    } catch { }
  }
  Send-Json $res 200 @{ ok = $true; revision = [int]$b.revision; savedAt = (Get-Date).ToString("o") }
}
# Clotures quotidiennes TradingView (websocket public, via tv-data\tv_history.py ; cache disque d'une journee).
function Handle-TvHistory($req, $res){
  if ($req.HttpMethod -ne "GET"){ Send-Json $res 405 @{ ok = $false; error = "GET requis" }; return }
  $syms = [string]$req.QueryString["symbols"]
  $from = [string]$req.QueryString["from"]
  if (-not $from){ $from = "2026-01-01" }
  if ($from -notmatch '^\d{4}-\d{2}-\d{2}$'){ Send-Json $res 400 @{ ok = $false; error = "date invalide" }; return }
  $list = @($syms -split ',' | Where-Object { $_ -match '^[A-Za-z0-9_.!&-]{1,24}:[A-Za-z0-9_.!&-]{1,24}$' })
  if ($list.Count -eq 0 -or $list.Count -gt 80){ Send-Json $res 400 @{ ok = $false; error = "symboles invalides" }; return }
  $script = Join-Path $root "tv-data\tv_history.py"
  $python = (Get-Command python -ErrorAction SilentlyContinue).Source
  if (-not $python){ $python = (Get-Command py -ErrorAction SilentlyContinue).Source }
  if (-not $python){ Send-Json $res 500 @{ ok = $false; error = "Python introuvable" }; return }
  $cache = Join-Path $storeDirPath "cache-prix"
  $ttl = "1800"; if ($req.QueryString["fresh"] -eq "1"){ $ttl = "0" }
  try {
    $out = & $python $script --symbols ($list -join ',') --from $from --cache $cache --ttl $ttl 2>$null | Out-String
    $out = $out.Trim()
    if (-not $out.StartsWith("{")){ Send-Json $res 502 @{ ok = $false; error = "historique TradingView indisponible" }; return }
    Send-RawJsonString $res $out
  } catch {
    Send-Json $res 502 @{ ok = $false; error = "historique TradingView indisponible" }
  }
}

# Fichiers qui ne doivent jamais etre servis (base FMP de 12 Go, depot git, secrets).
function Test-Denied($rel){
  $r = "/" + ($rel -replace '\\', '/').TrimStart('/')
  if ($r -match '^/\.git(/|$)') { return $true }
  if ($r -match '^/fmp-database/data(/|$)') { return $true }
  if ($r -match '^/data/mes-portefeuilles(/|$)') { return $true }   # donnees perso : seulement via /api/store/load
  if ($r -match '\.(sqlite|sqlite3|db|env|pem|key)$') { return $true }
  return $false
}

try { Ensure-AllMonthlySnapshots } catch { }
while ($listener.IsListening) {
  $context = $listener.GetContext()
  $req = $context.Request
  $res = $context.Response
  try {
    $path = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath)
    if ($path -eq "/api/ia/ping") {
      New-Item -ItemType Directory -Force -Path $iaDirPath | Out-Null
      Send-Json $res 200 @{ ok = $true; writable = $true; v = 14; store = $storeDirPath; dataFile = $iaFile; backups = $iaBackups; extBackup = $extBackup }
    } elseif ($path -eq "/api/ia/save") {
      Handle-IaSave $req $res
    } elseif ($path -eq "/api/ia/refresh") {
      Handle-IaRefresh $req $res
    } elseif ($path -eq "/api/ia/quote") {
      Handle-IaQuote $req $res
    } elseif ($path -eq "/api/tv/search") {
      Handle-TvSearch $req $res
    } elseif ($path -eq "/api/tv/snapshot") {
      Handle-TvSnapshot $req $res
    } elseif ($path -eq "/api/store/load") {
      Handle-StoreLoad $req $res
    } elseif ($path -eq "/api/store/save") {
      Handle-StoreSave $req $res
    } elseif ($path -eq "/api/tv/memo") {
      Handle-TvMemo $req $res
    } elseif ($path -eq "/api/publish/file") {
      Handle-PublishFile $req $res
    } elseif ($path -eq "/api/publish/go") {
      Handle-PublishGo $req $res
    } elseif ($path -eq "/api/atelier/media") {
      Handle-AtelierMedia $req $res
    } elseif ($path -eq "/api/tv/history") {
      Handle-TvHistory $req $res
    } else {
      if ($path -eq "/") { $path = "/index.html" }
      $filePath = [System.IO.Path]::GetFullPath((Join-Path $root ($path.TrimStart('/'))))
      # Le dossier data/portefeuille-ia/ est toujours servi depuis le dossier de CETTE instance
      # ($iaDirPath) : une instance de test (-IaDir) ne doit jamais lire le vrai journal. Les
      # sauvegardes datees (backups/) ne sont pas servies.
      $iaPrefix = "/data/portefeuille-ia/"
      $iaMapped = $false
      if ($path.StartsWith($iaPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        $iaMapped = $true
        $iaRoot = $iaDirPath.TrimEnd('\') + '\'
        $filePath = [System.IO.Path]::GetFullPath((Join-Path $iaDirPath $path.Substring($iaPrefix.Length)))
      }
      # Le chemin canonique doit rester SOUS la racine (bloque ..%2f) et hors liste noire.
      if ($iaMapped) {
        $denyIa = (-not $filePath.StartsWith($iaRoot, [System.StringComparison]::OrdinalIgnoreCase)) -or ($filePath.Substring($iaRoot.Length) -match '^backups(\\|$)')
      } else {
        $denyIa = (-not $filePath.StartsWith($rootWithSep, [System.StringComparison]::OrdinalIgnoreCase)) -or (Test-Denied $filePath.Substring($rootWithSep.Length))
      }
      if ($denyIa) {
        $res.StatusCode = 403
        $msg = [System.Text.Encoding]::UTF8.GetBytes("403 Forbidden")
        $res.OutputStream.Write($msg, 0, $msg.Length)
      } elseif (Test-Path $filePath -PathType Leaf) {
        $ext = [System.IO.Path]::GetExtension($filePath)
        $ct = $mime[$ext]
        if (-not $ct) { $ct = "application/octet-stream" }
        $res.ContentType = $ct
        $res.Headers.Add("Cache-Control", "no-cache, no-store, must-revalidate")
        $bytes = [System.IO.File]::ReadAllBytes($filePath)
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
      } else {
        $res.StatusCode = 404
        $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
        $res.OutputStream.Write($msg, 0, $msg.Length)
      }
    }
  } catch {
    try { $res.StatusCode = 500 } catch { }
  } finally {
    try { $res.OutputStream.Close() } catch { }
  }
}
