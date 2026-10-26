<!--
	Shown only when JavaScript is off (e.g. Brave Shields with "Block scripts"):
	the page still renders on the server, so without this it would look fine and do nothing.
-->
<script lang="ts">
	let {
		what = 'This page'
	}: {
		/** What needs JavaScript, e.g. "This album". */
		what?: string;
	} = $props();
</script>

<noscript>
	<div
		class="sticky top-0 z-toast border-b bg-warning-soft px-(--gutter) py-3 text-center text-sm text-warning"
		role="alert"
	>
		<strong class="font-semibold">{what} needs JavaScript to work.</strong>
		Allow scripts for this site and reload. In Brave: click the lion icon in the address bar and turn off
		<em class="font-medium not-italic">Block scripts</em>.
	</div>
</noscript>
