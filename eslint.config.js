import { fileURLToPath } from 'node:url';
import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import betterTailwind from 'eslint-plugin-better-tailwindcss';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';

export default ts.config(
	includeIgnoreFile(fileURLToPath(new URL('.gitignore', import.meta.url))),
	js.configs.recommended,
	ts.configs.recommendedTypeChecked,
	svelte.configs.recommended,
	prettier,
	svelte.configs.prettier,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node },
			// Type-aware rules: each file is checked with the tsconfig.json closest to it.
			parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname }
		},
		linterOptions: { reportUnusedDisableDirectives: 'error' },
		rules: {
			eqeqeq: ['error', 'always', { null: 'ignore' }],
			'no-console': ['warn', { allow: ['warn', 'error'] }],
			'@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
			'@typescript-eslint/switch-exhaustiveness-check': ['error', { considerDefaultExhaustiveForUnions: true }],
			// Async functions that don't await are fine (interfaces that want a promise);
			// no-floating-promises catches the awaits that matter.
			'@typescript-eslint/require-await': 'off',
			// Our apps are served from the root, never under a base path.
			'svelte/no-navigation-without-resolve': 'off',
			// Svelte's onclick={() => promise} and SvelteKit's actions are fine to fire and forget.
			'@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }]
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts'],
		languageOptions: { parserOptions: { parser: ts.parser, extraFileExtensions: ['.svelte'] } }
	},
	{
		// typescript-eslint can't see types across .svelte imports, so these misfire in components.
		// svelte-check (pnpm check) type-checks them properly.
		files: ['**/*.svelte'],
		rules: {
			'@typescript-eslint/no-unsafe-argument': 'off',
			'@typescript-eslint/no-unsafe-assignment': 'off',
			'@typescript-eslint/no-unsafe-call': 'off',
			'@typescript-eslint/no-unsafe-member-access': 'off',
			'@typescript-eslint/no-unsafe-return': 'off'
		}
	},
	{
		// Tailwind: only our tokens exist (packages/ui/src/app.css). Arbitrary values (p-[13px], text-[#fff],
		// [prop:value]) are reserved for one-off geometry: disable the rule on that line with a reason.
		// Arbitrary variants ([&>li+li]:border-t) are fine: they add selectors, not values.
		files: ['**/*.svelte'],
		plugins: { 'better-tailwindcss': betterTailwind },
		settings: { 'better-tailwindcss': { entryPoint: 'src/app.css', cwd: 'packages/ui' } },
		rules: {
			'better-tailwindcss/no-conflicting-classes': 'error',
			'better-tailwindcss/no-duplicate-classes': 'error',
			'better-tailwindcss/no-deprecated-classes': 'error',
			'better-tailwindcss/no-restricted-classes': [
				'error',
				{
					restrict: [
						{
							pattern: '^(?:.*:)?-?[a-z0-9-]*\\[[^\\]]*\\](?:/.*)?!?$',
							message: 'Arbitrary value "$0": use a token utility, or disable this rule on the line with a reason.'
						}
					]
				}
			]
		}
	},
	{
		// Shared components are fully on utilities: every class must be a utility or a known hook.
		files: ['packages/ui/**/*.svelte'],
		rules: {
			'better-tailwindcss/no-unknown-classes': [
				'error',
				{
					ignore: [
						// Hooks that pages target with :global() or tests look up, plus scoped-CSS classes.
						'^(btn|primary|secondary|ghost|ghost-danger|danger|sm|md|lg|full|icon-only|icon|panel|action|settings|wraps)$',
						'^(stat|status|text|cards|steps|empty|code-block|code-display|key|dash|clipped|copy-field|track|fill|error|indeterminate)$',
						'^(spinner|label|notice|info|warning|success|badge|icon-tile|easy-id|segmented|knob|qr|topbar|plain|wide|content|right)$',
						'^(toaster|toast|logo)$'
					]
				}
			]
		}
	},
	{
		// The apps too: every class is a utility, a hook from packages/ui, or a hook of their own
		// (scoped CSS, :global() targets, or a selector the e2e tests use).
		files: ['apps/**/*.svelte'],
		rules: {
			'better-tailwindcss/no-unknown-classes': [
				'error',
				{
					ignore: [
						'^(btn|primary|secondary|ghost|ghost-danger|danger|sm|md|lg|full|icon-only|plain|nav|panel|label)$',
						// relay pages: scoped CSS that stays (layout maths) and e2e selectors
						'^(hero|narrow|phone|share|id|reveal|key-line)$',
						// viewer: scoped CSS (grid maths, lightbox layout, animations) and e2e selectors
						'^(tile|shown|sharp|lightbox|stage|media|counter|slide-progress|row|badge|drop|files|add-more|header-actions|mini|state)$',
						// agent: scoped CSS targets and e2e selectors
						'^(ready|field|bar|code-row|alt|owner|actions|status-line)$'
					]
				}
			]
		}
	},
	{
		// Command-line scripts talk to the terminal.
		files: ['scripts/**', 'dev/**'],
		rules: { 'no-console': 'off' }
	},
	{
		// Plain JS (configs, scripts): no type information to lean on.
		files: ['**/*.{js,mjs,cjs}'],
		...ts.configs.disableTypeChecked
	}
);
