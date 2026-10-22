<script lang="ts">
  import type { Component } from 'svelte';
  import Lobby from './components/Lobby.svelte';
  import { findGame, type GameEntry, type GameProps } from './lib/games';
  import { route } from './lib/route.svelte';

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
      .then((module) => current && (loaded = { id: game.id, component: module.default }))
      .catch(() => current && (failed = game.name));
    return () => (current = false);
  });

  function play(game: GameEntry) {
    route.go(game.id);
  }

  function exit() {
    route.go(null);
  }
</script>

{#if !openGame}
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
