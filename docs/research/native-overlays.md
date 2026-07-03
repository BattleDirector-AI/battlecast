# Native broadcast overlay features: rFactor 2 & Le Mans Ultimate

> Research inventory used to scope battlecast's broadcast-overlay roadmap (widget
> parity + the overlay-configuration epic #19). "Native" = shipped in-game by
> Studio 397; third-party tools are labeled explicitly. Captured 2026-07-01.

Both sims ship a **first-party, web-based broadcast overlay system** built by
Studio 397. LMU's is essentially the rF2 system carried forward (same
architecture, same control-panel model, different port).

## 1. Overlay elements (native)

**rFactor 2** (official Users Guide — https://docs.studio-397.com/display/UG/Broadcast+Overlays):
- **Tower** — driver standings list; configurable row counts and scrolling.
- **Extended Battle Box** — nearby competitors with customizable gap thresholds (proximity/battle widget).
- **Race Update Box** — rotating in-race updates: fastest laps, class leaders, penalties, social hashtags.
- **Starting Order Slide** — animated grid per class.
- **Session Results Slide** — end-of-session results.
- **Standings Slide** — full-screen top-10 rankings.
- **Event Slide** — series and track information.
- **Schedule Slide** — round listing with pre/post-race views.
- **Intro Slide** — broadcast crew names.
- **Countdown Slide** — pre-race timer (with logo display).
- **Video Slide** — partner/content carousel.
- **Live Timing Page** — simplified timing/control interface.

**Le Mans Ultimate** (official guide https://lemansultimate.com/how-to-setup-broadcast-overlay/ ; RaceControl https://news.racecontrol.gg/hardware/how-to-setup-the-broadcast-overlay-in-le-mans-ultimate/ ; https://guide.lemansultimate.com):
- **Session Info** — session-length countdown + timing bar.
- **Timing Tower** — fields: gap to leader/class leader, interval to next car, pit-stop count, positions gained/lost, **energy remaining per stint**, tire compound; driver-or-team name toggle; class filter (Mixed/Multiclass/specific); auto-cycle rotation through drivers (configurable seconds); per-field show/hide to shrink tower width.
- **Status indicators** — Full Course Yellow (FCY), Safety Car, Green/Red/Checkered flag labels.
- **Detail Panel (lower-third)** — focused driver: name, position, car.
- **Qualifying Information panel** — bottom-right lower-third with target time and sector times.
- **On-board Driver Box** — upper-third: driver name/team/position + "On Board" label.
- **On-board HUD** — throttle / brake / speed / gear.
- **Battle box** — 1v1 last-lap or best-lap comparison between adjacent cars.
- **Results** — session and mid-race results, filterable by class.
- **Event Panel / Information Panel** — round number, event name, track name; plus a free-text commentary panel.

**Notably absent natively in BOTH:** a **track map / minimap**, and discrete
configurable position-change / fastest-lap "banner" pop-ups (rF2 folds these into
the single Race Update Box; LMU has no equivalent). Track map exists only as
third-party (§5).

## 2. Logo / sponsor branding

- **rF2 has genuine native sponsor rotation** — config `"rightCyclingAds"`, a rotating sponsor/ad slot with **configurable display duration**. (Studio 397 Users Guide, link above.)
- rF2 **Video Slide** = a rotating partner-content carousel.
- rF2 series logos placed in Event/Countdown slides; **team logos** auto-matched to vehicle files via an `images/team` folder; liveries override via `images/car`.
- **LMU: no logo/sponsor carousel or rotation is documented** — branding is effectively CSS/manual only. (lemansultimate.com + RaceControl.)

**Conclusion:** timed logo rotation is a **real native rF2 feature** and a
**documented gap in LMU** — matching it both matches rF2 and beats LMU.

## 3. Configuration & layout

- **Web-based Control Panel** is the primary interface — rF2 `http://localhost:5397/overlays/controlpanel.html`, LMU `http://localhost:6397/overlays/controlpanel.html`. Enables/disables elements, controls cameras, snaps to drivers, refreshes overlays, hides in-game panels, sets starting order.
- **File-based config (rF2):** `config.json` (series data, per-class colors, banner intervals, video paths), `vehicle_info_override.json`, `schedule.json`, `standings.json` (manual rankings), and `custom.css` / `custom_livetiming.css`.
- **Theming is CSS-based**, not a visual editor (colors, classes, fonts e.g. DIN Pro). (https://support.studio-397.com/hc/en-us/articles/4418248681999)
- **No drag-and-drop WYSIWYG layout editor.** Elements are toggled on/off and tuned via config/CSS; positions largely fixed by the template. LMU exposes only tower width + per-field show/hide; documents no config-file/CSS access.
- rF2 supports **safe-region** settings for linear-TV broadcast.

## 4. Architecture / delivery

- **Rendered as HTML/web pages**, not baked into the engine, served by a local HTTP server in the sim client.
- **Transparent overlay page** for compositing — rF2 `…:5397/overlays/overlays.html`, LMU `…:6397/overlays/overlays.html` — dropped into OBS/XSplit/vMix as a **Browser Source** (LMU documented at 1920x1080; other resolutions "unsupported").
- Can also render in-game in full-screen spectate (rF2) but "might introduce stutter"; Studio 397 recommends compositing in streaming software.
- **Remote control:** replace `localhost` with the machine IP; rF2 needs TCP 5397 open. Supports **multi-client control** (one panel driving multiple clients) via `overlays-config.json`.
- Data path: sim client feeds its own local overlay server; overlay pulls live timing/telemetry from it. LMU's data API is reported **more limited** — "in some cases does not provide" data overlays need (https://www.overtake.gg/threads/lmu-broadcast-control.293393/).

## 5. Gaps / limitations broadcasters cite

- In-game overlay causes **stutter** → forces the OBS-compositing workaround.
- rF2 **Standings element is "raw"** — requires manual `standings.json` entry; flagged pending.
- **No visual layout editor / limited repositioning** — heavy reliance on hand-edited CSS/JSON + font install.
- **Security footgun** — exposing overlay/control-panel publicly leaks IP and hands over broadcast control.
- **LMU overlay shipped buggy/limited** (Dec 2024) — FCY and Safety Car labels are **manual-only** (not game-state driven at release); no CSS/config customization documented.
- **LMU data-API gaps** prompted third-party replacements.
- **No native track map** in either sim.

**Third-party (NOT native), for contrast:** SimHub, Second Monitor (general
overlays/timing); **LMU Broadcast Control** (https://www.broadcastcontrol.uk/ —
live timing, incident detection, camera control, browser overlays); **RaceLab**
(https://racelab.app/lemansultimate/) and **RacePulse**
(https://racepulse.racing/lmu-overlay/); community **minimap/track-map** overlays.

## Implications for battlecast

- **Coverage.** The native "core" a broadcaster expects: standings tower (gap-to-leader, interval, pit count, positions ±, tire/energy), a battle/proximity box, driver lower-thirds (name/pos/car + qualifying/sector times), session/flag/FCY/SC status, on-board driver box + HUD (throttle/brake/speed/gear), results/standings/starting-order slides, and event/schedule/intro/countdown slides. battlecast already matches the two headline widgets (tower + battle box). Whitespace to add: on-board HUD, qualifying/sector lower-third, results/starting-order slides, and a rotating "race update box" (fastest lap/leader/penalty/position-change — native rF2, no LMU equivalent). A **native track map is absent from both** → pure upside.
- **Logo rotation is worth matching** — native rF2, gap in LMU.
- **Config/layout UX** is the biggest differentiation lever: native systems are control-panel-toggled + CSS/JSON-tuned with fixed layouts and no WYSIWYG editor (the most-cited friction). A web-based drag/resize/show-hide editor with saved layouts/profiles/themes wins here. Keep the **OBS Browser Source + transparent page + separate control panel** architecture (universal convergence), and plan around thin/inconsistent sim data APIs (especially LMU) — a robust producer/normalization layer is where reliability is won.
