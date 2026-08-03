"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity, Archive, Ban, Box, Check, ChevronDown, CircleGauge,
  Cloud, Command, Copy, Cpu, Database, Download, ExternalLink, Gamepad2,
  Globe2, HardDrive, LayoutDashboard, LoaderCircle, LockKeyhole,
  MemoryStick, Menu, MoreHorizontal, Network, Play, PlugZap, Puzzle,
  Drumstick, Heart, PackageOpen, Sparkles, WandSparkles,
  RefreshCw, RotateCcw, Save, Search, Server, Settings, Shield, ShieldCheck,
  SquareTerminal, Star, StopCircle, UserMinus, UserPlus, Users, Wifi, X,
  Bold, Eraser, FileText, Folder, FolderOpen, Italic, Palette, Plus, ServerCog, Trash2,
  Zap
} from "lucide-react";

const API = "http://127.0.0.1:4010/api";

type Player = { name: string; online: boolean; operator: boolean; whitelisted: boolean; role: string; lastSeen?: string };
type InventoryItem = { slot: number; id: string; count: number };
type PlayerInspection = { name: string; health: number; maxHealth: number; hunger: number; maxHunger: number; xpLevel: number; inventory: InventoryItem[] };
type Plugin = { file: string; name: string; sizeMb: number; modifiedAt: string; enabled: boolean };
type MarketplacePlugin = { id: number; owner: string; slug: string; name: string; description: string; downloads: number; stars: number; url: string };
type ServerInstance = { id: string; name: string; version: string; software: string; active: boolean; updatedAt: string };
type ServerFile = { name: string; path: string; type: "directory" | "file"; size: number; modifiedAt: string };
type LogLine = { id: number; time: string; stream: string; line: string };
type Config = {
  installed: boolean; name: string; version: string; software: string; memory: number;
  port: number; maxPlayers: number; motd: string; description?: string; serverIcon?: boolean; gamemode: string; difficulty: string;
  onlineMode: boolean; whitelist: boolean; pvp: boolean; viewDistance: number;
  simulationDistance: number; customHost?: string; installedAt?: string; instanceId?: string; githubOwner?: string;
};
type Status = {
  connected: boolean; installed: boolean; running: boolean; uptime: number; config: Config | null;
  metrics: { cpu: number; memoryMb: number }; players: Player[]; online: number;
  logs: LogLine[]; backups: { name: string; createdAt: string }[];
  java: { available: boolean; version: string }; localAddresses: string[];
  plugins: Plugin[]; tunnel: { provider: string | null; status: string; address: string; message: string; process?: boolean; claimUrl?: string };
  playit: { installed: boolean; managed: boolean; executable: string; version: string; install: { active: boolean; percent: number; label: string; error?: boolean } };
  installProgress?: { active: boolean; percent: number; label: string; error?: boolean } | null;
};

const emptyStatus: Status = {
  connected: false, installed: false, running: false, uptime: 0, config: null,
  metrics: { cpu: 0, memoryMb: 0 }, players: [], online: 0, logs: [], backups: [],
  java: { available: false, version: "In attesa" }, localAddresses: [], plugins: [], tunnel: { provider: null, status: "stopped", address: "", message: "" },
  playit: { installed: false, managed: false, executable: "", version: "", install: { active: false, percent: 0, label: "" } }
};

const navItems = [
  { id: "overview", label: "Panoramica", icon: LayoutDashboard },
  { id: "players", label: "Giocatori", icon: Users },
  { id: "plugins", label: "Plugin", icon: Puzzle },
  { id: "console", label: "Console", icon: SquareTerminal },
  { id: "network", label: "Rete e indirizzo", icon: Globe2 },
  { id: "servers", label: "Server e file", icon: ServerCog },
  { id: "backups", label: "Backup", icon: Archive },
  { id: "settings", label: "Impostazioni", icon: Settings },
];

function cn(...values: Array<string | false | undefined>) { return values.filter(Boolean).join(" "); }

async function api<T = unknown>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Operazione non riuscita");
  return data;
}

function timeAgo(value?: string) {
  if (!value) return "Mai visto";
  const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return "Adesso";
  if (minutes < 60) return `${minutes} min fa`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} ore fa`;
  return `${Math.floor(minutes / 1440)} giorni fa`;
}

function uptime(ms: number) {
  if (!ms) return "—";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

function Skin({ name, size = 44 }: { name: string; size?: number }) {
  // Remote player skins are dynamic and do not benefit from build-time image optimization.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="skin" style={{ width: size, height: size }} src={`https://mc-heads.net/avatar/${encodeURIComponent(name)}/${size}`} alt={`Skin di ${name}`} />;
}

function StatusDot({ online }: { online: boolean }) {
  return <span className={cn("status-dot", online ? "online" : "offline")} aria-label={online ? "Online" : "Offline"} />;
}

function AddressCredit({ owner = "sonoFrangu" }: { owner?: string }) {
  const safeOwner = owner.trim() || "sonoFrangu";
  return <a className="creator-mark" href={`https://github.com/${encodeURIComponent(safeOwner)}`} target="_blank" rel="noreferrer"><span>GH</span> creato da <b>@{safeOwner}</b></a>;
}

const motdColors = [
  ["Verde", "§a", "#55ff55"], ["Lime", "§e", "#ffff55"], ["Aqua", "§b", "#55ffff"], ["Blu", "§9", "#5555ff"],
  ["Viola", "§d", "#ff55ff"], ["Rosso", "§c", "#ff5555"], ["Oro", "§6", "#ffaa00"], ["Bianco", "§f", "#ffffff"], ["Grigio", "§7", "#aaaaaa"],
] as const;

const motdColorCodes: Record<string, string> = { "0": "#000", "1": "#0000aa", "2": "#00aa00", "3": "#00aaaa", "4": "#aa0000", "5": "#aa00aa", "6": "#ffaa00", "7": "#aaaaaa", "8": "#555555", "9": "#5555ff", a: "#55ff55", b: "#55ffff", c: "#ff5555", d: "#ff55ff", e: "#ffff55", f: "#fff" };

function RenderMotd({ value }: { value: string }) {
  const segments: Array<{ text: string; color: string; bold: boolean; italic: boolean }> = [];
  let style = { color: "#ffffff", bold: false, italic: false };
  let text = "";
  function flush() { if (text) { segments.push({ text, ...style }); text = ""; } }
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "§" && value[index + 1]) {
      flush();
      const code = value[index + 1].toLowerCase();
      if (motdColorCodes[code]) style = { color: motdColorCodes[code], bold: false, italic: false };
      else if (code === "l") style = { ...style, bold: true };
      else if (code === "o") style = { ...style, italic: true };
      else if (code === "r") style = { color: "#ffffff", bold: false, italic: false };
      index += 1;
    } else text += value[index];
  }
  flush();
  return <>{segments.map((segment, index) => <span key={`${index}-${segment.text}`} style={{ color: segment.color, fontWeight: segment.bold ? 800 : 500, fontStyle: segment.italic ? "italic" : "normal" }}>{segment.text}</span>)}</>;
}

function MotdEditor({ value, setValue }: { value: string; setValue: (value: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  function insert(code: string) {
    const start = input.current?.selectionStart ?? value.length;
    const end = input.current?.selectionEnd ?? value.length;
    setValue(`${value.slice(0, start)}${code}${value.slice(end)}`);
    requestAnimationFrame(() => { input.current?.focus(); input.current?.setSelectionRange(start + code.length, start + code.length); });
  }
  return <div className="motd-editor"><div className="motd-tools"><span><Palette /> Colore</span>{motdColors.map(([label, code, color]) => <button key={code} type="button" title={label} aria-label={`Colore ${label}`} style={{ "--motd-color": color } as React.CSSProperties} onClick={() => insert(code)} />)}<i /><button type="button" className="format-tool" title="Grassetto" onClick={() => insert("§l")}><Bold /></button><button type="button" className="format-tool" title="Corsivo" onClick={() => insert("§o")}><Italic /></button><button type="button" className="format-tool reset" title="Azzera formattazione" onClick={() => insert("§r")}><Eraser /></button></div><input ref={input} value={value} maxLength={120} onChange={(event) => setValue(event.target.value)} placeholder="Scrivi il messaggio e scegli i colori" /><div className="motd-live"><span>ANTEPRIMA</span><p><RenderMotd value={value || "Il messaggio del tuo server"} /></p></div><small>I pulsanti applicano i colori Minecraft nel punto in cui si trova il cursore.</small></div>;
}

function Setup({ status, refresh, toast }: { status: Status; refresh: () => void; toast: (message: string, error?: boolean) => void }) {
  const [versions, setVersions] = useState<{ id: string }[]>([]);
  const [existingServers, setExistingServers] = useState<ServerInstance[]>([]);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "Bosco Selvaggio", software: "paper", version: "1.21.8", memory: 4,
    port: 25565, maxPlayers: 20, motd: "Benvenuti nel nostro mondo!", gamemode: "survival",
    difficulty: "normal", whitelist: true, onlineMode: true, pvp: true, acceptEula: false
  });

  useEffect(() => {
    Promise.all([api<{ latest: string; versions: { id: string }[] }>("/versions"), api<{ servers: ServerInstance[] }>("/servers")]).then(([versionResult, serverResult]) => {
      setVersions(versionResult.versions);
      setExistingServers(serverResult.servers.filter((server) => !server.active));
      setForm((old) => ({ ...old, version: versionResult.latest }));
    }).catch(() => {});
  }, []);

  async function switchExisting(id: string) {
    setBusy(true);
    try { await api("/servers/switch", { method: "POST", body: JSON.stringify({ id }) }); toast("Server ripristinato"); refresh(); }
    catch (error) { toast(error instanceof Error ? error.message : "Cambio server non riuscito", true); }
    finally { setBusy(false); }
  }

  async function install() {
    setBusy(true);
    try {
      await api("/install", { method: "POST", body: JSON.stringify(form) });
      toast("Server installato. Il tuo mondo è pronto!");
      refresh();
    } catch (error) { toast(error instanceof Error ? error.message : "Installazione fallita", true); }
    finally { setBusy(false); }
  }

  return <main className="setup-shell">
    <div className="setup-brand"><div className="brand-mark"><Box size={21} /></div><span>CraftPilot</span><span className="beta">LOCAL</span></div>
    <section className="setup-card">
      <div className="step-track"><span className={step >= 1 ? "active" : ""}>1</span><i /><span className={step >= 2 ? "active" : ""}>2</span><i /><span className={step >= 3 ? "active" : ""}>3</span></div>
      {step === 1 && <>
        <div className="setup-icon"><Server /></div>
        <p className="eyebrow">NUOVO MONDO</p>
        <h1>Costruiamo il tuo server.</h1>
        <p className="lead">Scegli una base. CraftPilot scaricherà e configurerà tutto per te.</p>
        <label className="field"><span>Nome del server</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <div className="choice-grid">
          <button className={cn("choice-card", form.software === "paper" && "selected")} onClick={() => setForm({ ...form, software: "paper" })}>
            <span className="choice-icon lime"><Zap /></span><span><b>Paper</b><small>Veloce, plugin-ready</small></span><em>Consigliato</em>
          </button>
          <button className={cn("choice-card", form.software === "vanilla" && "selected")} onClick={() => setForm({ ...form, software: "vanilla" })}>
            <span className="choice-icon"><Box /></span><span><b>Vanilla</b><small>Esperienza originale</small></span>
          </button>
        </div>
        {existingServers.length > 0 && <div className="existing-servers"><span>Oppure riapri un server esistente</span>{existingServers.map((server) => <button key={server.id} disabled={busy} onClick={() => switchExisting(server.id)}><ServerCog /><span><b>{server.name}</b><small>{server.software} {server.version}</small></span><span>Apri →</span></button>)}</div>}
        <button className="primary wide" onClick={() => setStep(2)}>Continua <span>→</span></button>
      </>}
      {step === 2 && <>
        <p className="eyebrow">RISORSE</p><h1>Quanto deve essere grande?</h1>
        <p className="lead">Potrai modificare tutto anche in seguito.</p>
        <div className="form-grid">
          <label className="field"><span>Versione Minecraft</span><select value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })}>{versions.length ? versions.map((v) => <option key={v.id}>{v.id}</option>) : <option>{form.version}</option>}</select></label>
          <label className="field"><span>Modalità</span><select value={form.gamemode} onChange={(e) => setForm({ ...form, gamemode: e.target.value })}><option value="survival">Survival</option><option value="creative">Creative</option><option value="adventure">Adventure</option></select></label>
          <label className="field full"><span>Memoria: <b>{form.memory} GB</b></span><input type="range" min="2" max="16" value={form.memory} onChange={(e) => setForm({ ...form, memory: Number(e.target.value) })} /><div className="range-label"><span>2 GB · pochi amici</span><span>16 GB · community</span></div></label>
          <label className="field"><span>Giocatori massimi</span><input type="number" min="1" max="200" value={form.maxPlayers} onChange={(e) => setForm({ ...form, maxPlayers: Number(e.target.value) })} /></label>
          <label className="field"><span>Porta</span><input type="number" value={form.port} onChange={(e) => setForm({ ...form, port: Number(e.target.value) })} /></label>
          <label className="field full"><span>Messaggio del server</span><input value={form.motd} onChange={(e) => setForm({ ...form, motd: e.target.value })} /></label>
        </div>
        <div className="button-row"><button className="secondary" onClick={() => setStep(1)}>Indietro</button><button className="primary" onClick={() => setStep(3)}>Continua →</button></div>
      </>}
      {step === 3 && <>
        <div className="setup-icon"><ShieldCheck /></div><p className="eyebrow">CONTROLLO FINALE</p><h1>Pronti al decollo.</h1>
        <div className="summary-box">
          <div><span>Server</span><b>{form.name}</b></div><div><span>Software</span><b className="capitalize">{form.software} {form.version}</b></div>
          <div><span>Memoria</span><b>{form.memory} GB</b></div><div><span>Accesso</span><b>{form.whitelist ? "Solo whitelist" : "Pubblico"}</b></div>
        </div>
        <label className="checkline"><input type="checkbox" checked={form.acceptEula} onChange={(e) => setForm({ ...form, acceptEula: e.target.checked })} /><span><b>Accetto la EULA di Minecraft</b><small>Necessario per scaricare e avviare il software server.</small></span></label>
        {!status.java.available && <div className="warning"><PlugZap /><span><b>Java non è stato trovato</b><small>Installa la versione Java richiesta prima di avviare il server.</small></span></div>}
        {status.installProgress?.active && <div className="install-progress"><div><span>{status.installProgress.label}</span><b>{status.installProgress.percent}%</b></div><i><span style={{ width: `${status.installProgress.percent}%` }} /></i></div>}
        <div className="button-row"><button className="secondary" disabled={busy} onClick={() => setStep(2)}>Indietro</button><button className="primary" disabled={!form.acceptEula || busy} onClick={install}>{busy ? <><LoaderCircle className="spin" /> Installazione…</> : <><Download /> Installa il server</>}</button></div>
      </>}
    </section>
    <p className="setup-foot">I dati restano sul tuo computer · Nessun account richiesto</p>
  </main>;
}

function Overview({ status, action, setPage }: { status: Status; action: (path: string) => void; setPage: (page: string) => void }) {
  const config = status.config!;
  const memoryPercent = Math.min(100, Math.round((status.metrics.memoryMb / (config.memory * 1024)) * 100));
  const address = status.tunnel.address || (config.customHost ? `${config.customHost}${config.port !== 25565 ? `:${config.port}` : ""}` : "");
  const serverImage = config.serverIcon ? `${API}/server-icon?v=${encodeURIComponent(config.installedAt || "1")}` : "/craftpilot-logo.png";
  const recent = status.players.slice(0, 5);
  return <>
    <section className="server-hero">
      <div className="hero-pattern" />
      <div className="server-cube">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={serverImage} alt="Icona del server" />
      </div>
      <div className="hero-copy"><div className="hero-meta"><span className={cn("pill", status.running && "success")}><StatusDot online={status.running} />{status.running ? "ONLINE" : "OFFLINE"}</span><span>Paper {config.version}</span></div><h2>{config.name}</h2><button className="address" onClick={() => address ? navigator.clipboard.writeText(address) : setPage("network")}><Network /> {address || "Configura l’indirizzo pubblico"} {address ? <Copy /> : <span>→</span>}</button><AddressCredit owner={config.githubOwner} /></div>
      <div className="hero-actions">
        {!status.running ? <button className="power-button start" onClick={() => action("/start")}><Play /> Avvia server</button> : <><button className="power-button restart" onClick={() => action("/restart")}><RotateCcw /> Riavvia</button><button className="power-button stop" onClick={() => action("/stop")}><StopCircle /> Arresta</button></>}
      </div>
    </section>
    <section className="metric-grid">
      <article className="metric-card"><div className="metric-head"><span className="metric-icon green"><Activity /></span><span>CPU</span><b>{status.metrics.cpu}%</b></div><div className="meter"><i style={{ width: `${Math.min(status.metrics.cpu, 100)}%` }} /></div><small>Carico del processo Java</small></article>
      <article className="metric-card"><div className="metric-head"><span className="metric-icon blue"><MemoryStick /></span><span>Memoria</span><b>{(status.metrics.memoryMb / 1024).toFixed(1)} GB</b></div><div className="meter blue"><i style={{ width: `${memoryPercent}%` }} /></div><small>di {config.memory} GB assegnati</small></article>
      <article className="metric-card"><div className="metric-head"><span className="metric-icon amber"><Users /></span><span>Giocatori</span><b>{status.online}/{config.maxPlayers}</b></div><div className="avatar-stack">{recent.length ? recent.map((p) => <Skin key={p.name} name={p.name} size={28} />) : <span className="quiet">Nessuno online</span>}</div><small>{status.online ? "Nel mondo adesso" : "In attesa di avventurieri"}</small></article>
      <article className="metric-card"><div className="metric-head"><span className="metric-icon purple"><ClockIcon /></span><span>Uptime</span><b>{uptime(status.uptime)}</b></div><div className="uptime-bars">{[30,45,38,70,54,82,66,92,76,64,88,72].map((h, i) => <i key={i} style={{ height: `${status.running ? h : 8}%` }} />)}</div><small>{status.running ? "Sessione corrente" : "Server arrestato"}</small></article>
    </section>
    <section className="dashboard-grid">
      <article className="panel players-panel"><div className="panel-title"><div><h3>Giocatori recenti</h3><p>Accessi e ruoli della community</p></div><button className="text-button" onClick={() => setPage("players")}>Gestisci tutti →</button></div>
        <div className="player-list">{recent.length ? recent.map((player) => <div className="player-row" key={player.name}><div className="avatar-wrap"><Skin name={player.name} /><StatusDot online={player.online} /></div><div><b>{player.name}</b><span>{player.online ? "Nel server" : timeAgo(player.lastSeen)}</span></div><span className={cn("role", player.operator && "admin")}>{player.operator ? <Shield size={13} /> : <Gamepad2 size={13} />}{player.role}</span><button><MoreHorizontal /></button></div>) : <div className="empty-small"><Users /><b>Nessun giocatore conosciuto</b><span>Comparirà qui al primo accesso.</span></div>}</div>
      </article>
      <article className="panel"><div className="panel-title"><div><h3>Attività del server</h3><p>Ultimi eventi dalla console</p></div><button className="icon-button" onClick={() => setPage("console")}><ExternalLink /></button></div>
        <div className="activity-list">{status.logs.slice(-6).reverse().map((log) => <div key={log.id}><span className={cn("event-dot", log.stream === "stderr" && "red")} /><p>{log.line.replace(/^\[[^\]]+\]\s*/, "").slice(0, 115)}</p><time>{new Date(log.time).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</time></div>)}</div>
      </article>
    </section>
    <section className="quick-strip"><div><Zap /><span><b>Azioni rapide</b><small>Le operazioni più usate</small></span></div><button onClick={() => action("/backup")}><Archive /> Crea backup</button><button onClick={() => setPage("players")}><UserPlus /> Aggiungi alla whitelist</button><button onClick={() => setPage("console")}><Command /> Invia comando</button></section>
  </>;
}

function ClockIcon() { return <CircleGauge />; }

function PlayersPage({ status, playerAction, toast }: { status: Status; playerAction: (action: string, name: string) => void; toast: (message: string, error?: boolean) => void }) {
  const [search, setSearch] = useState("");
  const [addName, setAddName] = useState("");
  const [inspection, setInspection] = useState<PlayerInspection | null>(null);
  const [inspecting, setInspecting] = useState<string | null>(null);
  const players = status.players.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
  async function inspect(name: string) {
    setInspecting(name);
    try {
      const result = await api<{ player: PlayerInspection }>("/player-inspect", { method: "POST", body: JSON.stringify({ name }) });
      setInspection(result.player);
    } catch (error) { toast(error instanceof Error ? error.message : "Dati del giocatore non disponibili", true); }
    finally { setInspecting(null); }
  }
  const slots = Array.from({ length: 36 }, (_, slot) => inspection?.inventory.find((item) => item.slot === slot));
  return <section className="page-section">
    <div className="section-heading"><div><p className="eyebrow">COMMUNITY</p><h2>Giocatori</h2><p>Riconosci le persone dalla skin e assegna i permessi senza comandi.</p></div><div className="inline-add"><input placeholder="Nome Minecraft" value={addName} onChange={(e) => setAddName(e.target.value)} /><button className="primary" disabled={!addName} onClick={() => { playerAction("whitelist add", addName); setAddName(""); }}><UserPlus /> Aggiungi</button></div></div>
    {inspection && <article className="panel player-inspector">
      <button className="inspector-close icon-button" onClick={() => setInspection(null)} aria-label="Chiudi dettaglio"><X /></button>
      <div className="inspector-identity"><div className="skin-stage"><Skin name={inspection.name} size={104} /><span className="skin-glow" /></div><div><p className="eyebrow">STATO IN TEMPO REALE</p><h3>{inspection.name}</h3><span>Livello esperienza {inspection.xpLevel}</span></div></div>
      <div className="vital-grid">
        <div className="vital health"><span><Heart /><b>Vita</b><em>{Math.round(inspection.health * 10) / 10}/{inspection.maxHealth}</em></span><i><span style={{ width: `${Math.min(100, (inspection.health / inspection.maxHealth) * 100)}%` }} /></i></div>
        <div className="vital hunger"><span><Drumstick /><b>Fame</b><em>{inspection.hunger}/{inspection.maxHunger}</em></span><i><span style={{ width: `${Math.min(100, (inspection.hunger / inspection.maxHunger) * 100)}%` }} /></i></div>
      </div>
      <div className="inventory-section"><div className="inventory-title"><div><PackageOpen /><span><b>Inventario</b><small>Le ultime 9 caselle sono la barra rapida</small></span></div><span>{inspection.inventory.length} slot occupati</span></div><div className="inventory-grid">{slots.map((item, slot) => <div className={cn("inventory-slot", slot >= 27 && "hotbar")} key={slot} title={item ? `${item.id} × ${item.count}` : `Slot ${slot}`}><small>{slot + 1}</small>{item && <><span className="item-glyph">{item.id.split(":").pop()?.split("_").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span><b>{item.id.split(":").pop()?.replaceAll("_", " ")}</b><em>{item.count}</em></>}</div>)}</div></div>
    </article>}
    <div className="toolbar"><label className="search"><Search /><input placeholder="Cerca giocatore…" value={search} onChange={(e) => setSearch(e.target.value)} /></label><span>{status.online} online · {status.players.length} conosciuti</span></div>
    <div className="player-cards">{players.map((player) => <article className="player-card" key={player.name}>
      <div className="player-portrait"><Skin name={player.name} size={72} /><StatusDot online={player.online} /></div><div className="player-main"><div><h3>{player.name}</h3><span>{player.online ? "Online adesso" : timeAgo(player.lastSeen)}</span></div><span className={cn("role", player.operator && "admin")}>{player.operator ? <Shield size={13} /> : <Gamepad2 size={13} />}{player.role}</span></div>
      <div className="permission-row"><div><span className="perm-icon"><Star /></span><span><b>Operatore</b><small>Comandi amministrativi</small></span></div><button className={cn("toggle", player.operator && "on")} onClick={() => playerAction(player.operator ? "deop" : "op", player.name)}><i /></button></div>
      <div className="permission-row"><div><span className="perm-icon"><LockKeyhole /></span><span><b>Whitelist</b><small>Può entrare nel server</small></span></div><button className={cn("toggle", player.whitelisted && "on")} onClick={() => playerAction(player.whitelisted ? "whitelist remove" : "whitelist add", player.name)}><i /></button></div>
      <button className="inspect-button" onClick={() => inspect(player.name)} disabled={!player.online || inspecting === player.name}>{inspecting === player.name ? <LoaderCircle className="spin" /> : <PackageOpen />} {player.online ? "Vita, fame e inventario" : "Dati disponibili quando online"}</button>
      <div className="card-actions"><button onClick={() => playerAction("kick", player.name)} disabled={!player.online}><UserMinus /> Espelli</button><button className="danger-text" onClick={() => playerAction("ban", player.name)}><Ban /> Blocca</button></div>
    </article>)}{!players.length && <div className="empty-state"><Users /><h3>Nessun giocatore</h3><p>Aggiungi un nome alla whitelist o attendi il primo accesso.</p></div>}</div>
  </section>;
}

function ConsolePage({ status, sendCommand }: { status: Status; sendCommand: (command: string) => void }) {
  const [value, setValue] = useState("");
  const terminal = useRef<HTMLDivElement>(null);
  useEffect(() => { terminal.current?.scrollTo({ top: terminal.current.scrollHeight }); }, [status.logs]);
  function submit(e: React.FormEvent) { e.preventDefault(); if (value.trim()) { sendCommand(value); setValue(""); } }
  return <section className="page-section console-page"><div className="section-heading"><div><p className="eyebrow">CONTROLLO DIRETTO</p><h2>Console</h2><p>Log live e comandi del server, in una vista più leggibile.</p></div><span className={cn("pill", status.running && "success")}><StatusDot online={status.running} />{status.running ? "CONNESSA" : "SPENTA"}</span></div>
    <div className="terminal-window"><div className="terminal-top"><span><i /><i /><i /></span><b>craftpilot — {status.config?.name}</b><span>ULTIME {status.logs.length} RIGHE</span></div><div className="terminal-body" ref={terminal}>{status.logs.map((log) => <div className={cn("log-line", log.stream)} key={log.id}><time>{new Date(log.time).toLocaleTimeString("it-IT")}</time><span>{log.line}</span></div>)}{!status.logs.length && <div className="terminal-empty">Avvia il server per vedere i log.</div>}</div><form className="command-bar" onSubmit={submit}><span>›</span><input aria-label="Comando server" placeholder={status.running ? "Scrivi un comando, es. time set day" : "Il server è spento"} value={value} disabled={!status.running} onChange={(e) => setValue(e.target.value)} /><button disabled={!status.running || !value.trim()}>Invia ↵</button></form></div>
    <div className="command-chips"><span>Comandi rapidi</span>{["list", "time set day", "weather clear", "save-all"].map((cmd) => <button key={cmd} disabled={!status.running} onClick={() => sendCommand(cmd)}>{cmd}</button>)}</div>
  </section>;
}

function PluginsPage({ status, toast }: { status: Status; toast: (message: string, error?: boolean) => void }) {
  const [query, setQuery] = useState("Essentials");
  const [results, setResults] = useState<MarketplacePlugin[]>([]);
  const [searching, setSearching] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);
  const installedFiles = new Set(status.plugins.map((plugin) => plugin.file.toLowerCase()));
  const search = useCallback(async (value = query) => {
    setSearching(true);
    try { const data = await api<{ plugins: MarketplacePlugin[] }>(`/plugins/search?q=${encodeURIComponent(value)}`); setResults(data.plugins); }
    catch (error) { toast(error instanceof Error ? error.message : "Marketplace non disponibile", true); }
    finally { setSearching(false); }
  }, [query, toast]);
  // Search once when entering the marketplace, without coupling it to text input changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { const timer = setTimeout(() => search("Essentials"), 0); return () => clearTimeout(timer); }, []);
  async function install(plugin: MarketplacePlugin) {
    setInstalling(plugin.slug);
    try { await api("/plugins/install", { method: "POST", body: JSON.stringify({ owner: plugin.owner, slug: plugin.slug }) }); toast(`${plugin.name} installato. Riavvia per attivarlo.`); }
    catch (error) { toast(error instanceof Error ? error.message : "Installazione plugin fallita", true); }
    finally { setInstalling(null); }
  }
  async function disable(file: string) { try { await api("/plugins/disable", { method: "POST", body: JSON.stringify({ file }) }); toast(`${file} disabilitato`); } catch (error) { toast(error instanceof Error ? error.message : "Operazione fallita", true); } }
  return <section className="page-section"><div className="section-heading"><div><p className="eyebrow">ESTENSIONI PAPER</p><h2>Plugin</h2><p>Cerca nel marketplace Hangar, installa e controlla i plugin dal pannello.</p></div><a className="secondary" href="https://hangar.papermc.io/" target="_blank" rel="noreferrer"><ExternalLink /> Apri Hangar</a></div>
    <article className="panel plugin-market"><div className="market-search"><label className="search"><Search /><input aria-label="Cerca plugin" placeholder="Cerca Essentials, LuckPerms, Geyser…" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") search(); }} /></label><button className="primary" onClick={() => search()} disabled={searching}>{searching ? <LoaderCircle className="spin" /> : <Search />} Cerca</button></div><div className="market-note"><Puzzle /><span>I plugin vengono scaricati da Hangar e richiedono un riavvio del server. Controlla sempre compatibilità e permessi prima dell’installazione.</span></div>
      <div className="plugin-grid">{results.map((plugin) => <article className="plugin-card" key={`${plugin.owner}/${plugin.slug}`}><div className="plugin-card-top"><span className="plugin-logo"><Puzzle /></span><span className="tag"><Star /> {plugin.stars}</span></div><h3>{plugin.name}</h3><p>{plugin.description}</p><div className="plugin-meta"><span><Download /> {plugin.downloads.toLocaleString("it-IT")}</span><a href={plugin.url} target="_blank" rel="noreferrer"><ExternalLink /> Scheda</a></div><button className={cn("secondary", installedFiles.has(`${plugin.slug.toLowerCase()}.jar`) && "installed")} disabled={Boolean(installing)} onClick={() => install(plugin)}>{installing === plugin.slug ? <LoaderCircle className="spin" /> : installedFiles.has(`${plugin.slug.toLowerCase()}.jar`) ? <Check /> : <Download />}{installedFiles.has(`${plugin.slug.toLowerCase()}.jar`) ? "Installato" : "Installa"}</button></article>)}{!results.length && !searching && <div className="empty-state compact"><Puzzle /><h3>Nessun risultato</h3><p>Prova un altro termine di ricerca.</p></div>}</div></article>
    <article className="panel installed-plugins"><div className="panel-title"><div><h3>Installati sul server</h3><p>{status.plugins.length} file nella cartella plugins</p></div><span className="tag"><Check /> LOCALE</span></div>{status.plugins.map((plugin) => <div className="installed-row" key={plugin.file}><span className="plugin-logo small"><Puzzle /></span><div><b>{plugin.name}</b><small>{plugin.sizeMb} MB · modificato {timeAgo(plugin.modifiedAt)}</small></div><span className="tag"><Check /> ATTIVO</span><button className="secondary danger-text" onClick={() => disable(plugin.file)}><Ban /> Disabilita</button></div>)}{!status.plugins.length && <div className="empty-state compact"><Puzzle /><h3>Nessun plugin installato</h3><p>Inizia dal marketplace qui sopra.</p></div>}</article>
  </section>;
}

function NetworkPage({ status, save, toast }: { status: Status; save: (patch: Partial<Config>) => void; toast: (m: string, e?: boolean) => void }) {
  const config = status.config!;
  const [host, setHost] = useState(config.customHost || "");
  const [publicIp, setPublicIp] = useState("");
  const [provider, setProvider] = useState("playit");
  const [installingPlayit, setInstallingPlayit] = useState(false);
  const local = `${status.localAddresses[0] || "127.0.0.1"}:${config.port}`;
  async function detectIp() { try { const result = await api<{ ip: string }>("/public-ip"); setPublicIp(result.ip); } catch (e) { toast(e instanceof Error ? e.message : "IP non disponibile", true); } }
  async function tunnel(action: "start" | "stop") { try { await api(`/tunnel/${action}`, { method: "POST", body: JSON.stringify({ provider, port: config.port }) }); toast(action === "start" ? "Tunnel in avvio" : "Tunnel arrestato"); } catch (e) { toast(e instanceof Error ? e.message : "Tunnel non disponibile", true); } }
  async function downloadPlayit() {
    setInstallingPlayit(true);
    try { await api("/tools/playit/install", { method: "POST" }); toast("Playit scaricato: ora puoi rendere pubblico il server"); }
    catch (error) { toast(error instanceof Error ? error.message : "Download di Playit non riuscito", true); }
    finally { setInstallingPlayit(false); }
  }
  const publicAddress = status.tunnel.address || (publicIp ? `${publicIp}${config.port !== 25565 ? `:${config.port}` : ""}` : "");
  return <section className="page-section"><div className="section-heading"><div><p className="eyebrow">CONNETTIVITÀ</p><h2>Rete e indirizzo</h2><p>Condividi un solo indirizzo pubblico, senza confondere i giocatori con la rete tecnica dell’host.</p></div></div>
    <div className="network-grid">{status.tunnel.status !== "running" && <article className="panel network-card"><span className="big-icon"><Wifi /></span><div><p className="eyebrow">RETE LOCALE</p><h3>{local}</h3><p>Visibile solo dalla tua rete Wi‑Fi; non è l’indirizzo da condividere online.</p><AddressCredit owner={config.githubOwner} /></div><button className="secondary" onClick={() => navigator.clipboard.writeText(local)}><Copy /> Copia</button></article>}
      <article className="panel network-card public-network-card"><span className="big-icon violet"><Globe2 /></span><div><p className="eyebrow">INDIRIZZO PUBBLICO</p><h3>{publicAddress || "Rileva IP pubblico"}</h3><p>{status.tunnel.status === "running" ? "Questo è l’indirizzo da condividere con i giocatori di tutto il mondo." : `IP pubblico rilevato; per usarlo inoltra la porta ${config.port} nel router.`}</p><AddressCredit owner={config.githubOwner} /></div><button className="secondary" onClick={publicAddress ? () => navigator.clipboard.writeText(publicAddress) : detectIp}>{publicAddress ? <Copy /> : <Network />}{publicAddress ? "Copia" : "Rileva"}</button></article></div>
    <article className="panel domain-panel"><div className="panel-title"><div><h3>Il tuo indirizzo personalizzato</h3><p>Usa un dominio che possiedi, per esempio <b>play.mioserver.it</b>.</p></div><span className="tag"><Star /> CUSTOM IP</span></div>
      <div className="domain-form"><label className="field"><span>Dominio o sottodominio</span><div className="input-with-icon"><Globe2 /><input placeholder="play.esempio.it" value={host} onChange={(e) => setHost(e.target.value)} /></div></label><button className="primary" onClick={() => save({ customHost: host })}><Save /> Salva indirizzo</button></div>
      <div className="dns-guide"><div><span>1</span><p><b>Port forwarding</b><small>Nel router inoltra TCP {config.port} verso {status.localAddresses[0] || "l’IP locale di questo computer"}.</small></p></div><i /><div><span>2</span><p><b>Record DNS</b><small>Crea un record A per {host || "play.tuodominio.it"} verso {publicIp || "il tuo IP pubblico"}.</small></p></div><i /><div><span>3</span><p><b>Condividi</b><small>Gli amici entreranno con {host || "il dominio scelto"}{config.port !== 25565 ? `:${config.port}` : ""}.</small></p></div></div>
      <div className="custom-credit-row"><AddressCredit owner={config.githubOwner} /><span>L’attribuzione resta visibile anche quando usi {host || "un dominio personalizzato"}.</span></div><div className="info-note"><ShieldCheck /><p><b>Importante</b><span>Lasciamo “server-ip” vuoto: è l’impostazione corretta per ascoltare su tutte le interfacce. Il nome personalizzato si configura nel DNS, non dentro Minecraft.</span></p></div>
    </article>
    <article className="panel tunnel-panel"><div className="panel-title"><div><h3>Accesso mondiale senza port forwarding</h3><p>Il tunnel crea un indirizzo pubblico per i giocatori mentre il server resta sul tuo computer.</p></div><span className={cn("pill", status.tunnel.status === "running" && "success")}><StatusDot online={status.tunnel.status === "running"} />{status.tunnel.status === "running" ? "PUBBLICO" : "NON ATTIVO"}</span></div>
      <div className="tunnel-content"><div className="tunnel-select"><label className="field"><span>Provider tunnel</span><select value={provider} onChange={(e) => setProvider(e.target.value)}><option value="playit">playit.gg · consigliato per Minecraft</option><option value="tailscale">Tailscale Funnel · TCP</option><option value="cloudflare">Cloudflare Tunnel · richiede client ai giocatori</option></select></label><p className="tunnel-help">Con playit.gg esegui l’agente solo sull’host: i giocatori usano l’indirizzo pubblico assegnato.</p>{provider === "playit" && <div className={cn("playit-installer", status.playit?.installed && "installed")}><span className="playit-orb"><Globe2 /></span><div><b>{status.playit?.installed ? "Playit pronto" : "Installa Playit dall’app"}</b><small>{status.playit?.installed ? `${status.playit.managed ? "Gestito da CraftPilot" : "Installazione di sistema"}${status.playit.version ? ` · ${status.playit.version}` : ""}` : "Scarichiamo automaticamente la versione ufficiale per questo computer."}</small>{(installingPlayit || status.playit?.install.active) && <i><span style={{ width: `${status.playit?.install.percent || 8}%` }} /></i>}</div>{status.playit?.installed ? <span className="tool-check"><Check /></span> : <button className="secondary" disabled={installingPlayit} onClick={downloadPlayit}>{installingPlayit ? <LoaderCircle className="spin" /> : <Download />} Scarica</button>}</div>}</div><div className="tunnel-address">{status.tunnel.address ? <><span>Indirizzo da condividere</span><b>{status.tunnel.address}</b><AddressCredit owner={config.githubOwner} /><button className="secondary" onClick={() => navigator.clipboard.writeText(status.tunnel.address)}><Copy /> Copia</button></> : <><CloudIcon /><span>{status.tunnel.message || "Avvia un tunnel per ottenere un indirizzo pubblico."}</span><AddressCredit owner={config.githubOwner} />{status.tunnel.claimUrl && <a className="secondary claim-link" href={status.tunnel.claimUrl} target="_blank" rel="noreferrer"><ExternalLink /> Collega Playit</a>}</>}{status.tunnel.status === "running" || status.tunnel.process ? <button className="secondary danger-text" onClick={() => tunnel("stop")}><StopCircle /> Arresta</button> : <button className="primary" disabled={!status.running || (provider === "playit" && !status.playit?.installed)} onClick={() => tunnel("start")}><Globe2 /> Rendi pubblico</button>}</div></div>
      <div className="tunnel-note"><ShieldCheck /><span>La dashboard di amministrazione resta locale e non viene pubblicata. Solo la porta Minecraft viene resa raggiungibile.</span></div>
    </article>
  </section>;
}

function CloudIcon() { return <Cloud />; }

function fileSize(bytes: number) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function ServersPage({ status, toast, refresh }: { status: Status; toast: (message: string, error?: boolean) => void; refresh: () => void }) {
  const [servers, setServers] = useState<ServerInstance[]>([]);
  const [files, setFiles] = useState<ServerFile[]>([]);
  const [folderPath, setFolderPath] = useState("");
  const [busy, setBusy] = useState("");
  const [deleteStep, setDeleteStep] = useState(0);
  const [deleteName, setDeleteName] = useState("");

  const load = useCallback(async () => {
    try {
      const [serverResult, fileResult] = await Promise.all([api<{ servers: ServerInstance[] }>("/servers"), api<{ items: ServerFile[] }>(`/files?path=${encodeURIComponent(folderPath)}`)]);
      setServers(serverResult.servers);
      setFiles(fileResult.items);
    } catch (error) { toast(error instanceof Error ? error.message : "Impossibile leggere i file del server", true); }
  }, [folderPath, toast]);

  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer); }, [load]);

  async function serverAction(action: "new" | "switch", id = "") {
    setBusy(action + id);
    try {
      await api(action === "new" ? "/servers/new" : "/servers/switch", { method: "POST", body: JSON.stringify(id ? { id } : {}) });
      toast(action === "new" ? "Spazio pronto per il nuovo server" : "Server attivo cambiato");
      refresh();
    } catch (error) { toast(error instanceof Error ? error.message : "Operazione server non riuscita", true); }
    finally { setBusy(""); }
  }

  async function openFolder() {
    try { await api("/files/open", { method: "POST", body: JSON.stringify({ path: folderPath }) }); toast("Cartella aperta nel sistema"); }
    catch (error) { toast(error instanceof Error ? error.message : "Impossibile aprire la cartella", true); }
  }

  async function deleteServer() {
    setBusy("delete");
    try {
      await api("/server/delete", { method: "POST", body: JSON.stringify({ code: "ELIMINA", confirmation: deleteName }) });
      toast("Server spostato nell’archivio eliminati");
      setDeleteStep(0);
      refresh();
    } catch (error) { toast(error instanceof Error ? error.message : "Eliminazione non riuscita", true); }
    finally { setBusy(""); }
  }

  const crumbs = folderPath ? folderPath.split("/") : [];
  return <section className="page-section"><div className="section-heading"><div><p className="eyebrow">MONDI E ARCHIVI</p><h2>Server e file</h2><p>Crea più server, passa da un mondo all’altro e raggiungi i file senza usare il terminale.</p></div><button className="primary" disabled={status.running || Boolean(busy)} onClick={() => serverAction("new")}><Plus /> Nuovo server</button></div>
    {status.running && <div className="warning server-warning"><StopCircle /><span><b>Server acceso</b><small>Arrestalo prima di cambiare istanza o eliminarla. I file restano comunque consultabili.</small></span></div>}
    <div className="instance-grid">{servers.map((server) => <article className={cn("instance-card", server.active && "active")} key={server.id}><div className="instance-orb"><ServerCog /></div><div><span>{server.active ? "ATTIVO ORA" : "SALVATO"}</span><h3>{server.name}</h3><p>{server.software} {server.version}</p></div>{server.active ? <span className="active-check"><Check /> In uso</span> : <button className="secondary" disabled={status.running || Boolean(busy)} onClick={() => serverAction("switch", server.id)}>{busy === `switch${server.id}` ? <LoaderCircle className="spin" /> : <Play />} Apri</button>}</article>)}</div>
    <article className="panel file-browser"><div className="file-browser-head"><div><p className="eyebrow">FILE DEL SERVER ATTIVO</p><div className="breadcrumbs"><button onClick={() => setFolderPath("")}><Folder /> server</button>{crumbs.map((crumb, index) => <span key={`${crumb}-${index}`}><ChevronDown /><button onClick={() => setFolderPath(crumbs.slice(0, index + 1).join("/"))}>{crumb}</button></span>)}</div></div><button className="secondary" onClick={openFolder}><FolderOpen /> Apri nel sistema</button></div><div className="file-table"><div className="file-table-header"><span>Nome</span><span>Dimensione</span><span>Modificato</span></div>{files.map((file) => <button className="file-row" key={file.path} onClick={() => file.type === "directory" ? setFolderPath(file.path) : openFolder()}><span className={cn("file-kind", file.type === "directory" && "folder")}>{file.type === "directory" ? <Folder /> : <FileText />}</span><b>{file.name}</b><span>{file.type === "directory" ? "Cartella" : fileSize(file.size)}</span><time>{new Date(file.modifiedAt).toLocaleString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</time><span>›</span></button>)}{!files.length && <div className="empty-state compact"><FolderOpen /><h3>Cartella vuota</h3><p>I file compariranno qui dopo l’installazione o il primo avvio.</p></div>}</div></article>
    <article className="danger-zone"><div><Trash2 /><span><b>Elimina il server attivo</b><small>Il mondo viene tolto dall’app e spostato in un archivio locale recuperabile.</small></span></div><button disabled={status.running} onClick={() => setDeleteStep(1)}>Elimina server…</button></article>
    {deleteStep > 0 && <div className="modal-scrim"><div className="confirm-modal">{deleteStep === 1 ? <><span className="danger-orb"><Trash2 /></span><p className="eyebrow">PRIMA CONFERMA</p><h3>Vuoi rimuovere “{status.config?.name}”?</h3><p>Mondo, plugin, whitelist e configurazioni verranno spostati nell’archivio eliminati. Il server deve essere spento.</p><div className="button-row"><button className="secondary" onClick={() => setDeleteStep(0)}>Annulla</button><button className="danger-button" onClick={() => setDeleteStep(2)}>Sì, continua</button></div></> : <><span className="danger-orb"><Shield /></span><p className="eyebrow">SECONDA CONFERMA</p><h3>Scrivi il nome esatto del server</h3><p>Digita <b>{status.config?.name}</b> per confermare definitivamente.</p><label className="field"><span>Nome del server</span><input autoFocus value={deleteName} onChange={(event) => setDeleteName(event.target.value)} /></label><div className="button-row"><button className="secondary" onClick={() => setDeleteStep(1)}>Indietro</button><button className="danger-button" disabled={deleteName !== status.config?.name || busy === "delete"} onClick={deleteServer}>{busy === "delete" ? <LoaderCircle className="spin" /> : <Trash2 />} Elimina</button></div></>}</div></div>}
  </section>;
}

function BackupsPage({ status, action }: { status: Status; action: (path: string) => void }) {
  return <section className="page-section"><div className="section-heading"><div><p className="eyebrow">SICUREZZA DEL MONDO</p><h2>Backup</h2><p>Crea copie locali di mondi, configurazioni e giocatori.</p></div><button className="primary" onClick={() => action("/backup")}><Archive /> Crea backup ora</button></div>
    <div className="backup-hero"><Database /><div><h3>Il tuo mondo, al sicuro.</h3><p>I backup vengono conservati nella cartella <b>minecraft-data/backups</b>. Il file server viene escluso perché è sempre riscaricabile.</p></div></div>
    <article className="panel backup-list"><div className="panel-title"><div><h3>Copie disponibili</h3><p>{status.backups.length} backup locali</p></div></div>{status.backups.map((backup) => <div className="backup-row" key={backup.name}><span className="metric-icon green"><Archive /></span><div><b>{backup.name}</b><small>{new Date(backup.createdAt).toLocaleString("it-IT")}</small></div><span className="tag"><Check /> COMPLETO</span></div>)}{!status.backups.length && <div className="empty-state compact"><Archive /><h3>Nessun backup</h3><p>Crea la prima copia prima di iniziare una nuova avventura.</p></div>}</article>
  </section>;
}

function SettingsPage({ status, save, saveAssets }: { status: Status; save: (patch: Partial<Config>) => void; saveAssets: (data: { description: string; iconDataUrl?: string }) => void }) {
  const [form, setForm] = useState(status.config!);
  const [description, setDescription] = useState(status.config?.description || "Un mondo aperto a nuove avventure.");
  const [iconDataUrl, setIconDataUrl] = useState("");
  const serverImage = status.config?.serverIcon ? `${API}/server-icon?v=${encodeURIComponent(status.config.installedAt || "1")}` : "/craftpilot-logo.png";
  const presets = [
    { name: "Community", motd: "§d✦ §fUna community, infinite avventure", description: "🌍 Benvenuto nella nostra community!\nSurvival collaborativa • Eventi settimanali • Staff presente\nCostruisci, esplora e trova nuovi amici." },
    { name: "Avventura", motd: "§6⚔ §fLa tua leggenda comincia qui", description: "⚔️ Un mondo pieno di missioni e segreti.\nEsplora dungeon, affronta boss e conquista ricompense rare.\nOgni settimana una nuova avventura." },
    { name: "Tecnico", motd: "§b⚙ §fSurvival tecnica senza limiti", description: "⚙️ Il server per chi ama progettare in grande.\nEconomia tra giocatori • Farm condivise • Prestazioni ottimizzate\nRedstone e creatività sono le benvenute." },
  ];
  function addSection(text: string) { setDescription((old) => `${old.trim()}${old.trim() ? "\n" : ""}${text}`); }
  function saveIdentity() { save(form); saveAssets({ description, iconDataUrl: iconDataUrl || undefined }); }
  return <section className="page-section"><div className="section-heading"><div><p className="eyebrow">CONFIGURAZIONE</p><h2>Impostazioni</h2><p>Personalizza il server con anteprima immediata; le regole tecniche si applicano al riavvio.</p></div><button className="primary" onClick={saveIdentity}><Save /> Salva tutto</button></div>
    <div className="settings-grid"><article className="panel settings-panel profile-panel profile-editor"><div className="settings-title"><WandSparkles /><div><h3>Studio dell’identità</h3><p>Icona, messaggio breve e descrizione guidata</p></div><span className="studio-badge"><Sparkles /> LIVE</span></div><div className="profile-workspace"><div className="server-profile"><div className="server-icon-preview">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={iconDataUrl || serverImage} alt="Anteprima icona server" />
      </div><div><label className="field"><span>Carica l’icona del server</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => setIconDataUrl(String(reader.result)); reader.readAsDataURL(file); }} /></label><small className="field-help">Viene convertita automaticamente nel formato Minecraft 64×64.</small></div></div><div className="preset-row">{presets.map((preset) => <button key={preset.name} onClick={() => { setForm({ ...form, motd: preset.motd }); setDescription(preset.description); }}><Sparkles /><span><b>{preset.name}</b><small>Applica stile</small></span></button>)}</div><div className="motd-field"><span>MOTD breve · appare nell’elenco server Minecraft</span><MotdEditor value={form.motd} setValue={(motd) => setForm({ ...form, motd })} /></div><div className="description-toolbar"><span>Inserisci rapidamente</span><button onClick={() => addSection("📜 Regole: rispetto, niente grief e buon divertimento.")}>Regole</button><button onClick={() => addSection("🎉 Eventi: ogni weekend con premi esclusivi.")}>Eventi</button><button onClick={() => addSection("💬 Discord: discord.gg/tuoserver")}>Discord</button><button onClick={() => addSection("🧭 Modalità: Survival • PvP • Economia")}>Modalità</button></div><label className="field full"><span>Descrizione estesa · racconta cosa rende unico il server</span><textarea rows={6} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Racconta ai giocatori cosa troveranno…" /><small className="editor-count">{description.length} caratteri · {description.split(/\s+/).filter(Boolean).length} parole</small></label>
      <div className="minecraft-preview"><div className="preview-head"><span>ANTEPRIMA LISTA SERVER</span><span><i /> {status.online}/{form.maxPlayers}</span></div><div className="preview-server"><div className="preview-icon">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={iconDataUrl || serverImage} alt="" />
      </div><div><b>{form.name}</b><p><RenderMotd value={form.motd || "Il messaggio del tuo server"} /></p><small>{description.split(/\r?\n/)[0] || "Aggiungi una descrizione"}</small></div></div></div><button className="secondary save-identity" onClick={saveIdentity}><Save /> Salva identità del server</button></div></article><article className="panel settings-panel"><div className="settings-title"><Gamepad2 /><div><h3>Esperienza di gioco</h3><p>Regole e atmosfera del mondo</p></div></div><div className="form-grid"><label className="field full"><span>Nome server</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label><label className="field full"><span>Nome GitHub attribuzione</span><div className="input-with-icon"><Globe2 /><input value={form.githubOwner || "sonoFrangu"} onChange={(e) => setForm({ ...form, githubOwner: e.target.value.replace(/[^A-Za-z0-9-]/g, "") })} placeholder="sonoFrangu" /></div></label><label className="field"><span>Modalità</span><select value={form.gamemode} onChange={(e) => setForm({ ...form, gamemode: e.target.value })}><option value="survival">Survival</option><option value="creative">Creative</option><option value="adventure">Adventure</option></select></label><label className="field"><span>Difficoltà</span><select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}><option value="peaceful">Pacifica</option><option value="easy">Facile</option><option value="normal">Normale</option><option value="hard">Difficile</option></select></label></div><Toggle label="PvP" help="Permetti combattimenti tra giocatori" value={form.pvp} set={(v) => setForm({ ...form, pvp: v })} /><Toggle label="Whitelist" help="Accettare solo giocatori approvati" value={form.whitelist} set={(v) => setForm({ ...form, whitelist: v })} /><Toggle label="Modalità online" help="Verifica gli account con Mojang" value={form.onlineMode} set={(v) => setForm({ ...form, onlineMode: v })} /></article>
      <article className="panel settings-panel"><div className="settings-title"><Cpu /><div><h3>Prestazioni</h3><p>Risorse dedicate al processo Java</p></div></div><label className="field"><span>Memoria massima: <b>{form.memory} GB</b></span><input type="range" min="2" max="32" value={form.memory} onChange={(e) => setForm({ ...form, memory: Number(e.target.value) })} /></label><label className="field"><span>Giocatori massimi</span><input type="number" value={form.maxPlayers} onChange={(e) => setForm({ ...form, maxPlayers: Number(e.target.value) })} /></label><label className="field"><span>Distanza visuale: <b>{form.viewDistance} chunk</b></span><input type="range" min="3" max="24" value={form.viewDistance} onChange={(e) => setForm({ ...form, viewDistance: Number(e.target.value) })} /></label><label className="field"><span>Distanza simulazione: <b>{form.simulationDistance} chunk</b></span><input type="range" min="3" max="16" value={form.simulationDistance} onChange={(e) => setForm({ ...form, simulationDistance: Number(e.target.value) })} /></label><div className="runtime-info"><span><PlugZap /> Runtime</span><b>{status.java.version}</b><span><HardDrive /> Software</span><b className="capitalize">{form.software} {form.version}</b></div></article></div>
  </section>;
}

function Toggle({ label, help, value, set }: { label: string; help: string; value: boolean; set: (v: boolean) => void }) { return <div className="toggle-row"><div><b>{label}</b><span>{help}</span></div><button className={cn("toggle", value && "on")} onClick={() => set(!value)}><i /></button></div>; }

export default function Home() {
  const [status, setStatus] = useState<Status>(emptyStatus);
  const [page, setPage] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [sidebar, setSidebar] = useState(false);
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);

  const notify = useCallback((message: string, error = false) => {
    setToast({ message, error });
    setTimeout(() => setToast(null), 3600);
  }, []);

  const refresh = useCallback(async () => {
    try { setStatus(await api<Status>("/status")); }
    catch { setStatus((old) => ({ ...old, connected: false })); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { const starter = setTimeout(refresh, 0); const timer = setInterval(refresh, 1800); return () => { clearTimeout(starter); clearInterval(timer); }; }, [refresh]);

  async function action(path: string) {
    try { await api(path, { method: "POST" }); notify(path === "/backup" ? "Backup creato" : "Comando inviato"); setTimeout(refresh, 450); }
    catch (error) { notify(error instanceof Error ? error.message : "Operazione fallita", true); }
  }
  async function sendCommand(command: string) { try { await api("/command", { method: "POST", body: JSON.stringify({ command }) }); refresh(); } catch (e) { notify(e instanceof Error ? e.message : "Comando fallito", true); } }
  async function playerAction(actionName: string, name: string) { try { await api("/player", { method: "POST", body: JSON.stringify({ action: actionName, name }) }); notify(`Azione applicata a ${name}`); setTimeout(refresh, 500); } catch (e) { notify(e instanceof Error ? e.message : "Azione fallita", true); } }
  async function save(patch: Partial<Config>) { try { await api("/settings", { method: "POST", body: JSON.stringify(patch) }); notify("Impostazioni salvate"); refresh(); } catch (e) { notify(e instanceof Error ? e.message : "Salvataggio fallito", true); } }
  async function saveAssets(data: { description: string; iconDataUrl?: string }) { try { await api("/server-assets", { method: "POST", body: JSON.stringify(data) }); notify("Identità del server salvata"); refresh(); } catch (e) { notify(e instanceof Error ? e.message : "Salvataggio identità fallito", true); } }

  if (loading) return <div className="loading-screen"><div className="brand-mark"><Box /></div><LoaderCircle className="spin" /><p>Collegamento all’agente locale…</p></div>;
  if (!status.connected) return <div className="offline-screen"><div className="brand-lockup"><div className="brand-mark"><Box /></div><span>CraftPilot</span></div><div className="offline-card"><span className="setup-icon"><PlugZap /></span><p className="eyebrow">AGENTE LOCALE OFFLINE</p><h1>Avvia CraftPilot per continuare.</h1><p>La dashboard è pronta, ma il componente che controlla Java non è attivo. Apri <b>Avvia CraftPilot.command</b> oppure esegui <b>npm run craftpilot</b>.</p><button className="primary" onClick={refresh}><RefreshCw /> Riprova collegamento</button></div></div>;
  if (!status.installed) return <Setup status={status} refresh={refresh} toast={notify} />;

  const current = navItems.find((item) => item.id === page)!;
  return <div className="app-shell">
    <aside className={cn("sidebar", sidebar && "open")}><div className="brand-lockup"><div className="brand-mark"><Box /></div><span>CraftPilot</span><b>LOCAL</b></div><button className="mobile-close" onClick={() => setSidebar(false)}><X /></button>
      <nav>{navItems.map((item) => <button key={item.id} className={page === item.id ? "active" : ""} onClick={() => { setPage(item.id); setSidebar(false); }}><item.icon /><span>{item.label}</span>{item.id === "players" && status.online > 0 && <em>{status.online}</em>}</button>)}</nav>
      <div className="sidebar-server"><div><span className="mini-cube"><Box /></span><p><b>{status.config?.name}</b><small><StatusDot online={status.running} /> {status.running ? `${status.online} online` : "Offline"}</small></p></div><button><MoreHorizontal /></button></div>
      <div className="sidebar-foot"><ShieldCheck /><span><b>Tutto in locale</b><small>I dati restano qui</small></span></div>
    </aside>
    <div className="main-area"><header className="topbar"><button className="menu-button" onClick={() => setSidebar(true)}><Menu /></button><div><current.icon /><span>{current.label}</span></div><div className="top-actions"><span className="java-badge"><Check /> {status.java.version.split(" ").slice(0, 3).join(" ")}</span><button className="icon-button" onClick={refresh}><RefreshCw /></button><div className="local-user"><span>MP</span><div><b>Amministratore</b><small>Accesso locale</small></div><ChevronDown /></div></div></header>
      <main className="content">{page === "overview" && <Overview status={status} action={action} setPage={setPage} />}{page === "players" && <PlayersPage status={status} playerAction={playerAction} toast={notify} />}{page === "plugins" && <PluginsPage status={status} toast={notify} />}{page === "console" && <ConsolePage status={status} sendCommand={sendCommand} />}{page === "network" && <NetworkPage status={status} save={save} toast={notify} />}{page === "servers" && <ServersPage status={status} toast={notify} refresh={refresh} />}{page === "backups" && <BackupsPage status={status} action={action} />}{page === "settings" && <SettingsPage status={status} save={save} saveAssets={saveAssets} />}</main>
    </div>
    {sidebar && <button className="scrim" onClick={() => setSidebar(false)} aria-label="Chiudi menu" />}
    {toast && <div className={cn("toast", toast.error && "error")}><span>{toast.error ? <X /> : <Check />}</span>{toast.message}</div>}
  </div>;
}
