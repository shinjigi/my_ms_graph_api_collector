<template>
    <span class="inline-flex items-center gap-1.5" :class="wrapperClass">
        <span class="commit-dot" :class="sourceClass" :style="dotStyle"></span>
        <slot>
            <span v-if="label">{{ count !== undefined ? `${count} ` : '' }}{{ label }}</span>
        </slot>
    </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
    type: 'git' | 'svn' | 'mail' | 'teams';
    count?: number;
    label?: string;
    small?: boolean;
    wrapperClass?: string;
}>(), {
    small: false,
    wrapperClass: ''
});

const sourceClass = computed(() => `source-${props.type}`);
const dotStyle = computed(() => props.small ? { width: '5px', height: '5px' } : {});
</script>
