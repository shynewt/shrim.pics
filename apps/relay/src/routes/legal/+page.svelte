<script lang="ts">
	import { page } from '$app/state';
	import Fill from '#lib/components/Fill.svelte';
	import Prose from '#lib/components/Prose.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const op = $derived(data.operator);
</script>

<Prose title="Legal notice">
	<h2>Who runs {page.url.host}</h2>
	<p>
		<strong><Fill value={op.name} env="SHRIM_OPERATOR_NAME" /></strong><br />
		<Fill value={op.address} env="SHRIM_OPERATOR_ADDRESS" /><br />
		{#if op.registration}{op.registration}<br />{/if}
		Email: <Fill value={op.email} env="SHRIM_OPERATOR_EMAIL" />
	</p>
	{#if op.publicationDirector}
		<p>Publication director: {op.publicationDirector}</p>
	{/if}

	<h2>Hosting</h2>
	<p><Fill value={op.hosting} env="SHRIM_HOSTING" /></p>

	<h2>Reporting content</h2>
	<p>
		To report a shared link, use <a href="/report">the report form</a>. For anything else, including requests from
		authorities, write to <Fill value={op.email} env="SHRIM_OPERATOR_EMAIL" />. We read English{#if op.country}
			and the language of {op.country}{/if}.
	</p>

	<h2>Source code</h2>
	<p>
		The software behind this site is open source under the GNU AGPL 3.0 license.{#if data.sourceUrl}
			<a href={data.sourceUrl}>Read the code</a>.{/if}
	</p>
</Prose>
