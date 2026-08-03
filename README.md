# CraftPilot

CraftPilot è un pannello locale per creare e gestire server Minecraft Java self-hosted senza dover lavorare direttamente nel terminale.

## Avvio rapido

### macOS

Fai doppio clic su `Avvia CraftPilot.command`, poi apri `http://localhost:3000` nel browser se non si apre automaticamente.

Al primo avvio macOS può bloccare lo script: fai clic destro sul file, scegli **Apri**, quindi conferma.

### Windows / Linux

Con Node.js 22+ installato:

```bash
npm install
npm run craftpilot
```

Poi visita `http://localhost:3000`.

## Requisiti

- Node.js 22 o successivo
- Java compatibile con la versione Minecraft scelta
- Connessione internet durante il download iniziale
- Accettazione della Minecraft EULA nel setup

## Funzioni incluse

- download automatico delle versioni Vanilla e delle build stabili Paper;
- configurazione guidata di memoria, porta, modalità e whitelist;
- avvio, arresto e riavvio del processo Java;
- console live e comandi rapidi;
- giocatori con skin, stato online, operatore, whitelist, kick e ban;
- indirizzo LAN, rilevamento IP pubblico e guida al dominio personalizzato;
- backup locali del mondo e delle configurazioni;
- modifica semplificata delle principali proprietà del server.
- logo CraftPilot incluso e icona del server sostituibile dalla GUI;
- editor della descrizione del server con anteprima live;
- marketplace plugin Paper basato su Hangar, installazione e disabilitazione reversibile.
- tunnel Playit, Tailscale Funnel o Cloudflare TCP per pubblicare la porta Minecraft.

## Dove vengono salvati i dati

Tutto resta nella cartella `minecraft-data/`:

- `minecraft-data/server/` contiene mondo, configurazioni e JAR;
- `minecraft-data/backups/` contiene le copie create dalla dashboard;
- `minecraft-data/craftpilot.json` contiene le preferenze del pannello.

L'agente ascolta solo su `127.0.0.1:4010`, quindi non espone la gestione in rete.

## Indirizzo personalizzato

Minecraft non crea un IP personalizzato. CraftPilot lascia correttamente `server-ip` vuoto, mostra l'IP locale/pubblico e genera i passaggi per:

1. inoltrare la porta nel router;
2. creare un record DNS `A` verso l'IP pubblico;
3. condividere il dominio scelto.

Se la connessione usa una porta diversa da `25565`, condividila insieme all'indirizzo oppure configura un record DNS `SRV`.

Per una rete mondiale senza port forwarding, apri **Rete e indirizzo**, seleziona `playit.gg` e premi **Rendi pubblico**. CraftPilot lancerà l'agente installato sul computer e mostrerà l'indirizzo da condividere con i giocatori. Il dominio personalizzato si collega poi al provider tunnel scelto.

## Plugin

La sezione **Plugin** interroga il marketplace Hangar, mostra download e stelle, installa l'ultima versione Paper disponibile e conserva i JAR in `minecraft-data/server/plugins/`. Le modifiche ai plugin richiedono il riavvio del server. LuckPerms è il prossimo step per trasformare i ruoli visuali in permessi granulari reali.

## App dedicate

- Il logo generato è `public/craftpilot-logo.png` e viene usato anche come icona predefinita del server.
- macOS: `Avvia CraftPilot.command` oppure `npm run desktop:mac`; per creare il DMG esegui `CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac dmg --config desktop/macos/electron-builder.yml`.
- Windows: `desktop/windows/Avvia-CraftPilot.bat` o `Avvia-CraftPilot.ps1`; il bundle x64 assemblato è in `release/windows/win-unpacked/` e va avviato mantenendo insieme `CraftPilot.exe` e la cartella `resources`. Per creare installer NSIS e portable esegui `npx electron-builder --win --config desktop/windows/electron-builder.yml` su Windows.

Le build locali sono non firmate. Per distribuirle senza avvisi del sistema operativo servono i certificati del distributore della rispettiva piattaforma.

## Download pubblico e sito

- Landing per la condivisione: [craftpilot-vercel-site.vercel.app](https://craftpilot-vercel-site.vercel.app/)
- Repository: [github.com/sonoFrangu/CraftPilot](https://github.com/sonoFrangu/CraftPilot)
- Installer e sorgenti: [release v0.5.0](https://github.com/sonoFrangu/CraftPilot/releases/tag/v0.5.0)

## Note

Paper viene scaricato solo dal servizio ufficiale e soltanto quando è disponibile una build stabile. Per modifiche granulari ai permessi oltre a operatore e whitelist sarà opportuno aggiungere, in una fase successiva, l'integrazione con un plugin come LuckPerms.
