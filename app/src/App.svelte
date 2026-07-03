<script>
  import { onMount } from 'svelte'
  import svelteLogo from './assets/svelte.svg'
  import viteLogo from './assets/vite.svg'
  import heroImg from './assets/hero.png'
  import Counter from './lib/Counter.svelte'
  import TowerPage from './routes/tower/TowerPage.svelte'
  import BattlePage from './routes/battle/BattlePage.svelte'
  import AllPage from './routes/all/AllPage.svelte'
  import LogosPage from './routes/logos/LogosPage.svelte'
  import DriverPage from './routes/driver/DriverPage.svelte'
  import QualifyingPage from './routes/qualifying/QualifyingPage.svelte'
  import ResultsPage from './routes/results/ResultsPage.svelte'
  import ConfigPage from './routes/config/ConfigPage.svelte'

  // OBS Browser Sources are launched by URL, so widgets are selected by
  // pathname rather than an in-app navigation flow.
  const rawPath = typeof window !== 'undefined' ? window.location.pathname : '/'
  const path = rawPath.length > 1 ? rawPath.replace(/\/+$/, '') : rawPath
  const OVERLAY_ROUTES = ['/tower', '/battle', '/all', '/logos', '/driver', '/qualifying']
  // Real app routes are full-bleed; only the Vite scaffold landing (the `{:else}`
  // branch) keeps the constrained column. `/results` is a full-screen takeover
  // slide with an opaque board background, so it is full-bleed but NOT an overlay
  // route (it must not force a transparent page background).
  const FULL_BLEED_ROUTES = [...OVERLAY_ROUTES, '/config', '/results']

  onMount(() => {
    if (typeof document === 'undefined') return

    // The scaffold styles `#app` as a centered 1126px column with side borders and
    // `text-align: center`. That offsets and boxes-in a real route: on `/all` it
    // pushed the overlay ~400px right (past the viewport) and drew the border lines.
    // Overlays and `/config` must fill the window, so neutralize that constraint.
    if (FULL_BLEED_ROUTES.includes(path)) {
      const appEl = document.getElementById('app')
      if (appEl) {
        Object.assign(appEl.style, {
          width: '100%',
          maxWidth: 'none',
          margin: '0',
          padding: '0',
          border: 'none',
          textAlign: 'initial',
        })
      }
    }

    // Overlay routes composite over live video in OBS, so the page background must
    // be transparent — unlike the scaffold's themed light/dark background.
    if (OVERLAY_ROUTES.includes(path)) {
      document.documentElement.style.background = 'transparent'
      document.body.style.background = 'transparent'
      document.body.style.margin = '0'
      const appEl = document.getElementById('app')
      if (appEl) appEl.style.background = 'transparent'
    }
  })
</script>

{#if path === '/tower'}
  <TowerPage />
{:else if path === '/battle'}
  <BattlePage />
{:else if path === '/all'}
  <AllPage />
{:else if path === '/logos'}
  <LogosPage />
{:else if path === '/driver'}
  <DriverPage />
{:else if path === '/qualifying'}
  <QualifyingPage />
{:else if path === '/results'}
  <ResultsPage />
{:else if path === '/config'}
  <ConfigPage />
{:else}
  <section id="center">
    <div class="hero">
      <img src={heroImg} class="base" width="170" height="179" alt="" />
      <img src={svelteLogo} class="framework" alt="Svelte logo" />
      <img src={viteLogo} class="vite" alt="Vite logo" />
    </div>
    <div>
      <h1>Get started</h1>
      <p>Edit <code>src/App.svelte</code> and save to test <code>HMR</code></p>
    </div>
    <Counter />
  </section>

  <div class="ticks"></div>

  <section id="next-steps">
    <div id="docs">
      <svg class="icon" role="presentation" aria-hidden="true">
        <use href="/icons.svg#documentation-icon"></use>
      </svg>
      <h2>Documentation</h2>
      <p>Your questions, answered</p>
      <ul>
        <li>
          <a href="https://vite.dev/" target="_blank" rel="noreferrer">
            <img class="logo" src={viteLogo} alt="" />
            Explore Vite
          </a>
        </li>
        <li>
          <a href="https://svelte.dev/" target="_blank" rel="noreferrer">
            <img class="button-icon" src={svelteLogo} alt="" />
            Learn more
          </a>
        </li>
      </ul>
    </div>
    <div id="social">
      <svg class="icon" role="presentation" aria-hidden="true">
        <use href="/icons.svg#social-icon"></use>
      </svg>
      <h2>Connect with us</h2>
      <p>Join the Vite community</p>
      <ul>
        <li>
          <a href="https://github.com/vitejs/vite" target="_blank" rel="noreferrer">
            <svg class="button-icon" role="presentation" aria-hidden="true">
              <use href="/icons.svg#github-icon"></use>
            </svg>
            GitHub
          </a>
        </li>
        <li>
          <a href="https://chat.vite.dev/" target="_blank" rel="noreferrer">
            <svg class="button-icon" role="presentation" aria-hidden="true">
              <use href="/icons.svg#discord-icon"></use>
            </svg>
            Discord
          </a>
        </li>
        <li>
          <a href="https://x.com/vite_js" target="_blank" rel="noreferrer">
            <svg class="button-icon" role="presentation" aria-hidden="true">
              <use href="/icons.svg#x-icon"></use>
            </svg>
            X.com
          </a>
        </li>
        <li>
          <a href="https://bsky.app/profile/vite.dev" target="_blank" rel="noreferrer">
            <svg class="button-icon" role="presentation" aria-hidden="true">
              <use href="/icons.svg#bluesky-icon"></use>
            </svg>
            Bluesky
          </a>
        </li>
      </ul>
    </div>
  </section>

  <div class="ticks"></div>
  <section id="spacer"></section>
{/if}
