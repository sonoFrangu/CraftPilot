# CraftPilot — processo e progresso

Questo file è il diario operativo del progetto. Gli stati sono:

- `[x]` completato e verificato;
- `[~]` implementato in MVP, da irrobustire per la release;
- `[ ]` prossimo step.

## Step 0 — diagnosi del primo errore

- `[x]` Riprodotto il messaggio `Failed to fetch dynamically imported module`.
- `[x]` Identificata la causa: cache Vite del vecchio `react-loading-skeleton` rimasta attiva dopo la disinstallazione.
- `[x]` Riavviato il dev server: il wizard CraftPilot ora carica correttamente.

## Step 1 — core del server

- `[x]` Agente locale Node su `127.0.0.1:4010`.
- `[x]` Download Vanilla dal manifest Mojang.
- `[x]` Download Paper dal servizio ufficiale delle build stabili.
- `[x]` EULA, `server.properties`, memoria e porta.
- `[x]` Avvio/arresto/riavvio del processo Java.
- `[x]` Log live, comandi e metriche.

## Step 2 — gestione dalla GUI

- `[x]` Panoramica con stato, CPU, memoria, uptime e giocatori.
- `[x]` Giocatori con skin, operatore, whitelist, kick e ban.
- `[x]` Console leggibile con comandi rapidi.
- `[x]` Backup locali.
- `[x]` Impostazioni di gioco e prestazioni.
- `[x]` Profilo server: upload dell’icona PNG/JPG/WebP, preset Community/Avventura/Tecnico, inserimento rapido di regole/eventi/Discord e anteprima stile lista server.
- `[x]` Ispezione giocatore online: vita, fame, livello XP e inventario letto dal comando `data get` di Minecraft, con griglia 36 slot.
- `[x]` Tipografia rialzata e accessibile, con gerarchia più leggibile e dashboard 3D a rilievo (icone sollevate, extrusion shadow, hover prospettico).

## Step 3 — plugin

- `[x]` Nuova sezione Plugin.
- `[x]` Ricerca marketplace Hangar.
- `[x]` Installazione automatica del JAR Paper nella cartella `plugins`.
- `[x]` Elenco installati e disabilitazione reversibile (`.disabled`).
- `[~]` Compatibilità automatica versione Minecraft/plugin: da completare con un controllo dei metadati prima del download.
- `[ ]` Integrazione LuckPerms per ruoli e permessi granulari.

## Step 4 — accesso mondiale

- `[x]` Separata la gestione locale dall’accesso dei giocatori.
- `[x]` Wizard rete LAN/IP pubblico/DNS.
- `[x]` Supporto agente tunnel Playit, Tailscale Funnel e Cloudflare TCP quando il relativo client è installato.
- `[x]` Download Playit ufficiale direttamente dall’app, selezione automatica dell’asset macOS/Windows/Linux, permessi eseguibili e link di collegamento Playit al primo avvio.
- `[x]` Attribuzione GitHub persistente (`@sonoFrangu` predefinito e modificabile) accanto a locale, pubblico, DNS e tunnel.
- `[x]` Visualizzazione e copia dell’indirizzo pubblico del tunnel.
- `[x]` Quando il tunnel è attivo la GUI mostra l’indirizzo pubblico come riferimento principale e nasconde l’IP LAN ai giocatori.
- `[~]` Dominio personalizzato: salvataggio e guida DNS pronti; la creazione del record richiede un dominio dell’utente e credenziali del provider.
- `[ ]` Login remoto autenticato per la dashboard (fase separata, non pubblicare mai il pannello senza autenticazione).

## Step 5 — app per piattaforma

- `[x]` Launcher macOS dedicato (`Avvia CraftPilot.command`).
- `[x]` Launcher Windows dedicato (`desktop/windows/Avvia-CraftPilot.ps1` e `.bat`).
- `[~]` Target Electron separati macOS/Windows con build DMG/NSIS predisposte; bundle macOS arm64 assemblato e runtime GUI verificato dall’artefatto.
- `[x]` Tema visivo 3D (prospettiva, vetro, ombre e micro-animazioni) con palette originale verde/lime, coerente su entrambe le piattaforme.
- `[x]` Gestione multi-server: archiviazione istanze, creazione di un nuovo server e cambio server dalla GUI.
- `[x]` File browser del server con breadcrumb, dimensioni, date, apertura nel Finder/Explorer e protezione path traversal.
- `[x]` Eliminazione server con doppia conferma; i dati vengono spostati in `deleted-servers` per un recupero manuale.
- `[ ]` Build firmate e notarizzate, da eseguire con certificati Apple e Windows del distributore.

## Step 6 — release

- `[x]` Lint e build web verificati.
- `[x]` Test reale del download Playit ufficiale su macOS arm64 completato (`v0.15.13`, binario 4,3 MB, installato nella cartella dati gestita).
- `[x]` Verifica visuale del tema 3D e dell’editor identità in ambiente locale.
- `[x]` Verificati browser file, modale di doppia conferma e inserimento colori MOTD senza salvataggio distruttivo.
- `[x]` Ricostruiti i bundle finali macOS arm64 e Windows x64 dopo le modifiche v0.5; archivio sorgente `outputs/craftpilot-v0.5.zip` verificato con `unzip -t`.
- `[x]` API locale verificata con status/versioni e rifiuto corretto della EULA non accettata.
- `[x]` Ricerca Hangar verificata con un progetto reale (`Essentials`).
- `[x]` Target Electron macOS arm64 assemblato in modalità non firmata; bundle Windows x64 e arm64 assemblati (installer NSIS/portable restano disponibili dal target Windows).
- `[x]` Logo generato integrato nella dashboard, nel profilo server e nei target Electron.
- `[ ]` Test installazione reale dopo conferma EULA e download di una versione scelta.
- `[ ]` Test tunnel end-to-end da una rete esterna.
- `[ ]` Backup automatici pianificati e restore con conferma.
