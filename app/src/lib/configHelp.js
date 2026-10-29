/* User-facing help copy for the /config editor.
 *
 * The single source of truth for "what does this widget do" and "what does this
 * control change", written for a BROADCASTER — someone who downloaded the binary
 * and has never read the repo. No codebase jargon (`slot_id`, `subject`,
 * `notable`), no issue numbers, no spec rule references.
 *
 * Behavior described here is derived from `.ai/spec/what/widgets.md` and
 * `what/overlay-config.md`, which stay the canonical statements. When behavior
 * changes there, this copy changes with it — `configHelp.test.js` asserts that
 * every control the editor renders resolves to an entry, so a new knob cannot
 * ship undocumented.
 */

/** The eight widgets, keyed exactly as `config.widgets`. `title` is the human name
 *  (the editor's own labels are the terse config keys); `summary` says what the
 *  broadcaster will actually see on stream. */
export const WIDGET_HELP = Object.freeze({
  tower: {
    title: 'Standings tower',
    summary:
      'The running order down the side of the screen: every car with its position, class and gap, ' +
      "with the on-camera driver's row highlighted. In qualifying and practice the leader's row " +
      'shows the pole lap and everyone else shows their gap to it; in a race the leader reads ' +
      '"LEADER". The header also carries the session clock or lap counter.',
  },
  battle: {
    title: 'Battle box',
    summary:
      "A close-up of the on-camera driver's fight — the gap to the car ahead and the car behind, " +
      'plus an intensity meter that fills as they get closer. Shows "CLEAR AIR" when there is ' +
      'nobody to fight, and disappears entirely outside a racing session.',
  },
  logos: {
    title: 'Sponsor logos',
    summary:
      'A branding slot that cycles through the images you upload under "Logo rotation" below, one ' +
      'at a time. Shows nothing until you add at least one image.',
  },
  driver: {
    title: 'Driver name-tag (lower-third)',
    summary:
      'The name card that appears along the bottom when the camera cuts to a new driver — name, ' +
      'position and class. It fires on the cut, holds for a few seconds, then wipes away, so it ' +
      'is off screen most of the time even while switched on.',
  },
  qualifying: {
    title: 'Timing bar (lower-third)',
    summary:
      'The timing card for the driver on camera — best and last lap, sector times, and the delta ' +
      'to a target time when the producer sends one. Like the name-tag it fires on a camera cut ' +
      'and then hides, and it only fires in the session types you tick below.',
  },
  racecontrol: {
    title: 'Race control',
    summary:
      'The flag status bar across the top: green, yellow, red and chequered, plus Full Course ' +
      'Yellow and Safety Car when they are running. Appears in every session type whenever there ' +
      'is something to report, and stays hidden when there is not.',
  },
  onboard: {
    title: 'On-board HUD',
    summary:
      'An "ON BOARD" name tag for the driver on camera — position, number, name and the other ' +
      'driver info you tick below — with their live throttle and brake bars, speed and gear ' +
      'underneath. The tag shows even when the car sends no telemetry; the telemetry row ' +
      'appears only while it does.',
  },
  updates: {
    title: 'Race updates',
    summary:
      'A card that announces what just happened in the race — a fastest lap, a new leader, a ' +
      'retirement or a penalty — one at a time, each for a few seconds. It only shows news your ' +
      'producer sends, never replays what was already happening when the overlay loaded, and ' +
      'stays empty between updates.',
  },
  weather: {
    title: 'Weather box',
    summary:
      'A small strip with the air temperature, the track temperature and the conditions, exactly ' +
      'as your producer reports them, updated live. It shows only what the producer sends and ' +
      'draws nothing while no weather is sent, so an empty box is not a fault.',
  },
  info: {
    title: 'Info panel',
    summary:
      'A strip naming the event — round, event name and track — with one line of text below it ' +
      'at a time: lines your producer sends first, then the lines you add here, each for a few ' +
      'seconds. It hides itself completely while there is no event and no line to show, so an ' +
      'empty panel is not a fault.',
  },
})

/** Per-control help. Keys are logical field names, not `data-testid`s, so one entry
 *  serves a control wherever it is rendered (geometry is shared by all seven
 *  widgets; `trigger` by both lower-thirds). */
export const FIELD_HELP = Object.freeze({
  // --- shared: every widget ---
  visible:
    'Include this widget in the combined /all overlay. You can also override it per Browser ' +
    'Source without changing the profile, by adding ?show= or ?hide= to that source’s URL.',
  x: 'Distance from the left edge of the canvas, in canvas pixels. You can also drag the widget in the preview.',
  y: 'Distance from the top edge of the canvas, in canvas pixels. You can also drag the widget in the preview.',
  w: 'Width in canvas pixels. You can also drag the widget’s corner handle in the preview.',
  h:
    'Height in canvas pixels. For the standings tower this also decides how many rows fit before ' +
    'the overflow settings below take over.',
  z: 'Stacking order where widgets overlap — a higher number draws on top of a lower one.',
  hideWhenIdle:
    'Drop this widget out of the overlay completely while it has nothing to show, instead of ' +
    'leaving an empty panel on screen. Only offered for widgets that can be idle.',
  idleGraceSeconds:
    'When a battle ends, keep showing it for this many seconds before the box switches to clear ' +
    'air, so a fight that drifts in and out of range doesn’t make the box flicker. A camera cut ' +
    'to another car always updates it at once. 0 turns the hold off.',
  textScale:
    'Make this widget’s text bigger: normal, large (115%) or larger (130%). Picking a size also ' +
    'widens the widget by the same amount, so its columns keep their room — check it still fits ' +
    'beside its neighbours. Choosing normal again shrinks it back (a widget pushed against the ' +
    'canvas edge may need nudging back into place).',
  plateAlpha:
    'How solid the dark panel behind this widget looks. Turn it down to let busy footage show ' +
    'through — the names, numbers, bars and outlines drawn on top stay at full strength either ' +
    'way, so the widget never gets harder to read. Only offered for widgets that have a panel.',

  // --- lower-thirds: driver + qualifying ---
  trigger:
    '"dwell" shows the card on each camera cut and hides it again after the time beside this box. ' +
    '"persistent" leaves it up for as long as that driver is on camera.',
  dwellSeconds:
    'How long the card stays up after a camera cut, in dwell mode. If the camera cuts again while ' +
    'it is showing, the timer restarts in place rather than flickering off and back on.',

  // --- weather box and info panel ---
  tempUnit:
    'Show temperatures in degrees Fahrenheit instead of Celsius. Temperatures are always shown ' +
    'in whole degrees.',
  weatherCard:
    'Adds the weather (air and track temperature and the conditions) to the info panel as one ' +
    'more line, after your own lines. It shows only while your producer sends weather. Off by ' +
    'default, because the weather box already shows it.',

  // --- info panel only ---
  infoDwellSeconds:
    'How long each info line stays on screen before the next one replaces it, from 2 to 60 ' +
    'seconds. A single line stays up for as long as it is the only one.',
  infoLines:
    'Your own lines for the info panel, such as sponsors or where to follow the broadcast. ' +
    'They show after any lines your producer sends, one at a time. Up to 10 lines of up to 120 ' +
    'characters; a line you already have is not added twice.',

  // --- race updates only ---
  updatesDwellSeconds:
    'How long each race update card stays on screen, from 2 to 60 seconds. Updates that arrive ' +
    'together wait their turn and show one after another, each for this long.',

  // --- qualifying timing bar only ---
  modes:
    'Which session types the timing bar appears in when the camera cuts. Leave a session type ' +
    'unticked to keep the bar off screen there — most broadcasts want it in qualifying and ' +
    'practice but not mid-race.',
  fireOnClassBest:
    'Also flash the bar whenever the producer flags the on-camera driver’s lap as the best in ' +
    'their class — including in session types you left unticked above. This is the "fastest lap" ' +
    'moment.',

  // --- standings tower only ---
  classDisplay:
    '"inline" keeps one overall running order and badges each row with its position in class ' +
    '(e.g. GTP 3/7). "grouped" splits the tower into a block per class, with positions restarting ' +
    'inside each block.',
  cycleEnabled:
    'When there are more cars than fit in the tower’s height, page through the ones that do not ' +
    'fit instead of cutting them off the bottom. Leave this off to simply show as many as fit.',
  maxRows:
    'Leave as "auto" to fit as many rows as the tower’s height allows. Enter a number to cap the ' +
    'rows directly regardless of height.',
  perPageSeconds: 'How long each page of cycled cars stays on screen before advancing to the next.',
  pinTop:
    'How many cars at the front stay locked in place at the top of the tower while the rest cycle ' +
    'underneath them. Set to 0 to cycle the whole field.',
  pinScope:
    '"overall" pins the outright leaders. "class" pins the leader of each class instead — the ' +
    'usual choice for a multi-class field.',
  pinSubject:
    'Always keep the on-camera driver’s row visible, even when the page they belong to is not the ' +
    'one currently showing.',

  // --- on-board HUD only ---
  speedUnit:
    'Show speed in mph instead of km/h. The producer always sends km/h and the widget converts, so ' +
    'this is purely a display choice.',
  waitForLowerThird:
    'Keep the driver’s name from showing in two places at once. With the driver name-tag on ' +
    '"dwell", the whole HUD waits until its card wipes away. On "persistent", only the HUD’s identity ' +
    'strip is hidden; the speed, gear and pedal bars keep showing (if the producer sends them). Only applies on the combined ' +
    '/all overlay.',

  // --- global settings ---
  profileName:
    'Saved layouts. A Browser Source picks one with ?profile=<name>, so you can keep separate ' +
    'layouts for different series or broadcasts and switch without editing anything.',
  canvasSize:
    'The design canvas your widget positions are measured against — 1920x1080 by default. Each ' +
    'Browser Source scales this canvas to its own size, so you lay out once at one resolution.',
  reducedMotion:
    'Turn the overlay’s transitions down. Leave this off for OBS (the default): OBS reports a ' +
    '"reduced motion" preference that battlecast deliberately ignores, so animations play ' +
    'normally. A ?motion= parameter overrides this per Browser Source.',
  producerSrc:
    'The live race feed this overlay reads — your producer application’s address. battlecast ' +
    'connects out to it, so the producer has to be running already. Left as-is, this points at ' +
    'the bundled demo producer (http://localhost:8080/events), not your own — replace it with ' +
    'your producer’s real address. A ?src= parameter on a Browser Source URL overrides it for ' +
    'that source.',
  feedReconnect:
    'Open a fresh connection to the producer straight away, using the address above. Some ' +
    'failures the overlay retries on its own, but one it gives up on for good — so if the line ' +
    'above still says not connected after you have started the producer or fixed the address, ' +
    'this is what unsticks it without reloading the page. It changes no setting.',
  obsUrl:
    'Copy this into an OBS Browser Source (set the source to your canvas size). It already ' +
    'carries the profile and producer selected above.',
  logoUpload:
    'Upload the sponsor images the logo widget cycles through. Needs the companion server running ' +
    '— without it you can still arrange everything and use Export JSON.',
  logoPerSlot: 'How long each logo stays on screen before the next one takes its place.',
  logoOrder:
    '"sequential" plays the logos in the order listed above. "shuffle" mixes them up, so the same ' +
    'sponsor is not always first.',
  classColors:
    'Give a class its own color instead of the one battlecast picks automatically. Type the class ' +
    'exactly as your producer sends it (e.g. "GTP" or "LMGT3 Am"), pick a color, and it applies ' +
    'everywhere that class appears — the standings tower, battle box, lower-thirds, grid and ' +
    'results. A class with no entry here keeps its automatic color; removing an entry returns it ' +
    'to that automatic color too.',
  classTags:
    'Whether class chips, class-rank badges and class group headers show, for the whole overlay. ' +
    '"auto" follows the producer: it hides them when the producer reports a single-class ' +
    'session and shows them when the producer does not say. "show" and "hide" override the ' +
    'producer either way. The class color bars stay in every case. The editor preview’s sample ' +
    'feed does not say, so at "auto" the preview shows the tags.',
  nameStyle:
    'How driver names show in every widget: the standings tower, battle box, lower-thirds, ' +
    'on-board HUD, race updates, grid and results. "short" shows each driver as a compact code ' +
    '(E.JAC), so widgets keep their set size. "full" shows the initial and last name ' +
    '(E. Jacobs) and never cuts a name short: a widget grows wider than its set width to fit a ' +
    'long name, past its box in the preview and over its neighbours, and can run past the edge ' +
    'of the canvas or the Browser Source.',
  themePreset:
    'The look of the whole overlay. "Modern" is the standard battlecast look. "Vintage 70s" is a ' +
    '1970s US network look: gold italic lettering with a hard black drop shadow and a red bar on ' +
    'the on-camera driver. "Vintage 80s" is a 1980s F1 timing-screen look: yellow-green ' +
    'computer lettering with a black outline and a red header. Only the look changes; what each ' +
    'widget shows, when and where stays the same, and class colors are the same in every look. ' +
    'Add ?theme=vintage70 (or vintage80, or modern) to a Browser Source URL to override this for ' +
    'that one source. The preview shows the chosen look; this editor panel always stays modern.',
})

/** Per-metric help for the tower's "tower metrics shown" group. Called out
 *  individually because the qualifying/practice suppression (a deliberate
 *  presentation rule) surprises people who tick a box and see nothing. */
export const TOWER_METRIC_HELP = Object.freeze({
  interval:
    'The gap to the car immediately ahead, shown next to the gap to the leader. Useful for ' +
    'spotting a fight that the leader gap hides.',
  pit:
    'Completed pit-stop count, plus an indicator while a car is in the pits. Hidden in qualifying ' +
    'and practice — it is a race readout.',
  tire:
    'Tire compound, plus a wear bar. In qualifying and practice the compound still shows but the ' +
    'wear bar is hidden.',
  fuel:
    'A fuel (or hybrid energy) level bar, for endurance broadcasts. Hidden in qualifying and ' +
    'practice.',
  lapFlash:
    'When a car completes a lap, its gap cell shows the new lap time for 5 seconds, then goes ' +
    'back to the gap. Purple marks a session or class best and green a personal best, as the ' +
    'producer flags them.',
})

/** Per-field help for the on-board HUD's "driver info shown" group. */
export const DRIVER_INFO_HELP = Object.freeze({
  name: 'Show the driver’s name on the HUD.',
  number: 'Show the car number.',
  position: 'Show the car’s overall race position, such as P4.',
  class: 'Show the car’s class (e.g. GTP, LMP2).',
  make: 'Show the manufacturer, such as Cadillac. Your producer has to supply it.',
  model: 'Show the car model, such as V-Series.R. Your producer has to supply it.',
})

/** Every help map, for the coverage test and any future docs export. */
export const HELP_MAPS = Object.freeze({
  WIDGET_HELP,
  FIELD_HELP,
  TOWER_METRIC_HELP,
  DRIVER_INFO_HELP,
})
