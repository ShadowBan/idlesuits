<script lang="ts">
  interface Row {
    label: string;
    /** "500:1", "push", and so on. */
    pays: string;
  }

  interface Props {
    title: string;
    rows: Row[];
    /** The row the current hand lands on, if any. */
    lit?: string;
  }

  let { title, rows, lit }: Props = $props();
</script>

<table>
  <caption>{title}</caption>
  <tbody>
    {#each rows as row (row.label)}
      <tr class:lit={row.label === lit}>
        <td>{row.label}</td>
        <td>{row.pays}</td>
      </tr>
    {/each}
  </tbody>
</table>

<style>
  table {
    width: 100%;
    border-collapse: collapse;
    font: 12px/1.5 var(--font-ui);
  }
  caption {
    text-align: left;
    font: 600 11px/1 var(--font-ui);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
    padding-bottom: 6px;
  }
  td {
    padding: 1px 6px;
    color: var(--muted);
  }
  td:last-child {
    text-align: right;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }
  tr.lit td {
    background: color-mix(in srgb, var(--gold) 22%, transparent);
    color: var(--ink);
  }
  tr.lit td:first-child {
    border-radius: 4px 0 0 4px;
  }
  tr.lit td:last-child {
    border-radius: 0 4px 4px 0;
  }
</style>
