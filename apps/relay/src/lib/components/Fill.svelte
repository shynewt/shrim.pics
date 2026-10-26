<!-- An operator detail from config, or a loud placeholder so a missing one is never published silently. -->
<script lang="ts">
	let { value, env }: { value: string; env: string } = $props();

	// eslint-disable-next-line better-tailwindcss/no-restricted-classes -- one-off: the placeholder sits a little smaller than the text around it
	const classes = 'rounded-xs bg-warning-soft px-1 font-mono text-[0.85em] text-warning';
</script>

{#if value}{value}{:else}<mark class={classes}>[set {env}]</mark>{/if}
