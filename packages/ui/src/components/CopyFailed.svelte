<!-- The inline "couldn't copy" line under CopyField and CodeBlock (the browser refused the clipboard). -->
<script lang="ts">
	import Icon from './Icon.svelte';

	let { message = "Couldn't copy. Select the text and copy it manually." }: { message?: string } = $props();
</script>

<p class="flex items-start gap-1.5 text-sm text-danger" role="alert">
	<Icon name="circle-alert" size={16} class="mt-0.5" />
	<span>{message}</span>
</p>
