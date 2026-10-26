<script lang="ts">
	let { size = 20, label }: { size?: 16 | 20 | 32; label?: string } = $props();
</script>

<span
	class="spinner inline-block size-(--size) flex-none animate-spin rounded-full border-2 border-current/20 border-t-current"
	style:--size="{size}px"
	role={label ? 'status' : undefined}
>
	{#if label}<span class="visually-hidden">{label}</span>{/if}
</span>
