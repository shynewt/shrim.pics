<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';
	import Icon, { type IconName } from './Icon.svelte';
	import Spinner from './Spinner.svelte';

	type Props = {
		variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'ghost-danger';
		size?: 'sm' | 'md' | 'lg';
		icon?: IconName;
		trailingIcon?: IconName;
		loading?: boolean;
		full?: boolean;
		/** Icon-only button. Pass `label` for the accessible name. */
		iconOnly?: boolean;
		label?: string;
		href?: string;
		children?: Snippet;
	} & Omit<HTMLButtonAttributes, 'children'> &
		Omit<HTMLAnchorAttributes, 'children' | 'type'>;

	let {
		variant = 'secondary',
		size = 'md',
		icon,
		trailingIcon,
		loading = false,
		full = false,
		iconOnly = false,
		label,
		href,
		children,
		disabled,
		class: className = '',
		...rest
	}: Props = $props();

	const iconSize = $derived(size === 'lg' ? 20 : 16);

	const sizes = {
		sm: 'h-8 rounded-sm text-sm',
		md: 'h-10 rounded-md text-sm',
		lg: 'h-12 rounded-md text-md'
	};
	const padding = { sm: 'px-3', md: 'px-4', lg: 'px-5' };
	const squares = { sm: 'w-8', md: 'w-10', lg: 'w-12' };
	// Hover and press only while enabled (`:not(:disabled)` also matches links).
	const variants = {
		primary: 'bg-primary text-on-primary not-disabled:hover:bg-primary-hover not-disabled:active:bg-primary-active',
		secondary:
			'border-strong bg-surface text-text not-disabled:hover:bg-surface-sunken not-disabled:active:border-field',
		ghost: 'bg-transparent text-text not-disabled:hover:bg-surface-sunken not-disabled:active:bg-surface-pressed',
		danger: 'bg-danger text-on-danger not-disabled:hover:bg-danger-hover',
		'ghost-danger': 'bg-transparent text-danger not-disabled:hover:bg-danger-soft'
	};

	// `btn`, the variant, the size, `icon-only` and `full` stay as hooks for :global() rules in the apps.
	const classes = $derived([
		'btn',
		variant,
		size,
		className,
		{ full, 'icon-only': iconOnly },
		'relative inline-flex flex-none items-center justify-center gap-2 border font-medium whitespace-nowrap no-underline transition-colors',
		sizes[size],
		iconOnly ? 'p-0' : padding[size],
		full ? 'w-full' : iconOnly && squares[size],
		variant !== 'secondary' && 'border-transparent',
		variants[variant],
		// Phones: at least a 44px hit area (lg is 48 already); the button itself keeps its size.
		size !== 'lg' && 'max-xs:touch-target',
		loading ? 'cursor-progress' : 'cursor-pointer disabled:cursor-not-allowed disabled:opacity-50'
	]);
</script>

{#snippet content()}
	{#if loading}
		<Spinner size={16} />
	{:else if icon}
		<Icon name={icon} size={iconOnly && size !== 'sm' ? 20 : iconSize} />
	{/if}
	{#if iconOnly}
		<span class="visually-hidden">{label}</span>
	{:else}
		{@render children?.()}
	{/if}
	{#if trailingIcon && !iconOnly}
		<Icon name={trailingIcon} size={iconSize} />
	{/if}
{/snippet}

{#if href && !disabled}
	<a {href} class={classes} title={iconOnly ? label : undefined} {...rest as HTMLAnchorAttributes}>
		{@render content()}
	</a>
{:else}
	<button
		class={classes}
		disabled={disabled || loading}
		aria-busy={loading || undefined}
		title={iconOnly ? label : undefined}
		type="button"
		{...rest as HTMLButtonAttributes}
	>
		{@render content()}
	</button>
{/if}
