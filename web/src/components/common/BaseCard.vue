<template>
    <div class="card bg-base-100 shadow-sm border border-base-300">
        <div class="card-body" :class="noPadding ? 'p-0' : paddingClass">
            <slot />
        </div>
    </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
    noPadding?: boolean;
    paddingClass?: string;
}>(), {
    noPadding: false,
    paddingClass: 'p-3'
});
</script>
