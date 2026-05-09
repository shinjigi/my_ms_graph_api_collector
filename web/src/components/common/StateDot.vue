<template>
    <span class="state-dot shrink-0" :style="{ background: bg, ...sizeStyle }" :class="extraClass"></span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { stateColor } from '../../utils';

const props = withDefaults(defineProps<{
    state: string;
    size?: string;
    extraClass?: string;
}>(), {
    size: '8px', // Default size matching TsRow
    extraClass: ''
});

const bg = computed(() => stateColor(props.state));
const sizeStyle = computed(() => ({ width: props.size, height: props.size }));
</script>

<style scoped>
.state-dot {
    border-radius: 50%;
    display: inline-block;
}
</style>
