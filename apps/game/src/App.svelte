<script lang="ts">
  import { untrack, type Component } from 'svelte';
  import CharmsPage from './components/charms/CharmsPage.svelte';
  import ClubPage from './components/ClubPage.svelte';
  import Lobby from './components/Lobby.svelte';
  import AdminPanel from './components/AdminPanel.svelte';
  import SettingsDialog from './components/SettingsDialog.svelte';
  import SyncConflict from './components/SyncConflict.svelte';
  import { ui } from './lib/ui.svelte';
  import { findGame, type GameProps } from './lib/games';
  import { route } from './lib/route.svelte';
  import { recent } from './lib/recent.svelte';
  import { autoFeed } from './lib/autofeed.svelte';
  import { player } from './lib/player.svelte';

  /*
   * Auto play runs on the engine's clock, table shown or not. Once the player
   * is known (and again whenever the page comes back into view), whatever came
   * due while they were away settles, and what it came to is told. At the
   * table that's playing, the table itself does this as it shows the rounds.
   */
  const catchUp = () => {
    const s = autoFeed.session;
    if (player.ready && s?.on && route.current !== s.game) void autoFeed.catchUp();
  };
  // Only when the player becomes known: catching up changes the state, which mustn't set this off again.
  $effect(() => {
    if (player.ready) untrack(catchUp);
  });
  $effect(() => {
    const on = () => document.visibilityState === 'visible' && catchUp();
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  });

  /** The table being played, if the route names one that exists and is built. */
  const openGame = $derived.by(() => {
    const game = findGame(route.current);
    return game?.load ? game : undefined;
  });

  let loaded = $state<{ id: string; component: Component<GameProps> } | null>(null);
  let failed = $state<string | null>(null);

  // Each table's code is fetched the first time it is opened.
  $effect(() => {
    const game = openGame;
    if (!game || loaded?.id === game.id) return;
    let current = true;
    failed = null;
    game
      .load!()
      .then((module) => {
        if (!current) return;
        loaded = { id: game.id, component: module.default };
        recent.visit(game.id);
      })
      .catch(() => current && (failed = game.name));
    return () => (current = false);
  });

  function play(game: { id: string }) {
    route.go(game.id);
  }

  function exit() {
    route.go(null);
  }

  // The admin panel's other secret switch, for a keyboard: type the word anywhere outside a field.
  const WORD = 'pitboss';
  let typed = '';
  function onKey(e: KeyboardEvent) {
    if ((e.target as HTMLElement).closest('input, select, textarea')) return;
    if (e.key.length !== 1) return;
    typed = (typed + e.key.toLowerCase()).slice(-WORD.length);
    if (typed !== WORD) return;
    typed = '';
    ui.admin = true;
    ui.adminOpen = true;
  }
</script>

<svelte:window onkeydown={onKey} />
<SettingsDialog />
<SyncConflict />
{#if ui.admin}<AdminPanel />{/if}

{#if route.current === 'charms'}
  <CharmsPage onExit={exit} />
{:else if route.current === 'club'}
  <ClubPage onExit={exit} />
{:else if !openGame}
  <Lobby onPlay={play} />
{:else if loaded?.id === openGame.id}
  {@const Table = loaded.component}
  <Table onExit={exit} />
{:else}
  <div class="loading">
    {#if failed}
      <p>{failed} could not be loaded.</p>
      <button type="button" onclick={exit}>Back to the floor</button>
    {:else}
      <p>Dealing you in…</p>
    {/if}
  </div>
{/if}

<style>
  .loading {
    min-height: 100dvh;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 14px;
    color: var(--muted);
    font: 15px/1.4 var(--font-ui);
  }
</style>
