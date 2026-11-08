<script lang="ts">
  import type { GlanceGroup } from '../lib/glance';

  /**
   * What a player needs to come away knowing, always shown in How to play:
   * every bet and what it pays, the bonus and its features. The fine print
   * follows, in collapsible sections.
   */
  let { groups }: { groups: readonly GlanceGroup[] } = $props();
</script>

{#each groups as group (group.heading)}
  <section>
    <h3>{group.heading}{#if group.note}<small>{group.note}</small>{/if}</h3>
    <ul>
      {#each group.items as item (item.name)}
        <li>
          <b>{item.name}</b>
          {#if item.tag}<span class="tag">{item.tag}</span>{/if}
          <span class="text">{item.text}</span>
        </li>
      {/each}
    </ul>
  </section>
{/each}
{#if groups.length}<p class="more">The fine print</p>{/if}

<style>
  /* At a glance: every bet and feature, named with a line on what it does. */
  section {
    display: grid;
    gap: 8px;
  }
  section h3 {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 10px;
    margin: 0;
    font: 700 13px/1.2 var(--font-display);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--gold);
  }
  section h3 small {
    font: 400 12px/1.3 var(--font-ui);
    letter-spacing: 0;
    text-transform: none;
    color: var(--muted);
  }
  section ul {
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  section li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 2px 10px;
    padding: 8px 12px;
    border-radius: 10px;
    background: rgb(255 255 255 / 0.04);
    box-shadow: inset 0 0 0 1px var(--line);
  }
  section li b {
    font: 600 14px/1.25 var(--font-ui);
  }
  section .tag {
    align-self: start;
    padding: 2px 8px;
    border-radius: 999px;
    background: rgb(232 182 76 / 0.14);
    font: 600 11px/1.4 var(--font-ui);
    color: var(--gold);
    white-space: nowrap;
  }
  section .text {
    grid-column: 1 / -1;
    font: 13px/1.45 var(--font-ui);
    color: var(--muted);
  }
  .more {
    margin: 4px 0 -4px;
    font: 600 11px/1 var(--font-ui);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
  }
</style>
