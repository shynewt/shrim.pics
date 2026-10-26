<script lang="ts">
	let { host }: { host: string } = $props();

	const scheme = 'https://';
	const path = $derived(`${host}/s/Xk3f9QaPz2`);
	const key = '#k8Fz2pQwR7vLm3xY';
</script>

<figure
	class="overflow-hidden rounded-lg border bg-surface p-6"
	style:--path-ch={scheme.length + path.length}
	style:--key-ch={key.length}
>
	<p class="link mono text-xl wrap-anywhere text-text lg:text-2xl">
		<span class="visually-hidden">Example share link: </span><span class="text-subtle">{scheme}</span><span>{path}</span
		><wbr /><span class="text-accent-text">{key}</span>
	</p>
	<figcaption class="notes">
		<div class="note grid gap-0.5 font-sans text-sm text-muted">
			<span class="bracket" aria-hidden="true"></span>
			<strong class="font-medium text-text">Sent to {host}</strong>
			<span>Which album to open.</span>
		</div>
		<div class="note key-note grid gap-0.5 font-sans text-sm text-muted">
			<span class="bracket" aria-hidden="true"></span>
			<strong class="font-medium text-text">Stays in the browser</strong>
			<span>The key that decrypts the photos.</span>
		</div>
	</figcaption>
</figure>

<style>
	.notes {
		display: grid;
		gap: var(--space-4);
		margin-top: var(--space-5);
	}

	.note {
		padding-left: var(--space-3);
		border-left: 2px solid var(--color-border-strong);
	}

	.key-note {
		border-left-color: var(--color-accent);
	}

	.bracket {
		display: none;
	}

	/* The columns match each part of the link, so the notes use its mono type to measure in ch. */
	@media (min-width: 1024px) {
		.link {
			white-space: nowrap;
		}

		.notes {
			grid-template-columns: calc(var(--path-ch) * 1ch) calc(var(--key-ch) * 1ch);
			gap: 0;
			margin-top: var(--space-2);
			font-family: var(--font-mono);
			font-size: var(--text-2xl);
			line-height: var(--leading-2xl);
		}

		.note {
			border-left: 0;
			padding: 0 var(--space-2) 0 0;
		}

		.bracket {
			display: block;
			height: var(--space-2);
			margin-bottom: var(--space-2);
			border: 1px solid var(--color-border-strong);
			border-top: 0;
		}

		.key-note .bracket {
			border-color: var(--color-accent);
		}

		.key-note {
			padding-right: 0;
		}
	}
</style>
