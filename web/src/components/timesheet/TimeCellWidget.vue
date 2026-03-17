<template>
    <div class="tc-wrap">
        <button class="tc-btn tc-minus" :class="{ invisible: modelValue <= 0 }" @click="adjust(-0.5)" tabindex="-1">−</button>
        <template v-if="editing">
            <input
                ref="inputRef"
                type="number"
                step="0.5"
                min="0"
                class="tc-input"
                :value="modelValue || ''"
                placeholder="0"
                @blur="saveInput"
                @keydown="onKeydown"
            >
        </template>
        <template v-else>
            <span class="tc-val" :class="extraValCls" @click="startEdit">
                {{ modelValue > 0 ? modelValue : '—' }}
            </span>
        </template>
        <button class="tc-btn tc-plus" @click="adjust(0.5)" tabindex="-1">+</button>
    </div>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue';

const props = defineProps<{
    modelValue:   number;
    extraValCls?: string;
}>();
const emit = defineEmits<{ update: [val: number] }>();

const editing  = ref(false);
const inputRef = ref<HTMLInputElement | null>(null);

function adjust(delta: number) {
    emit('update', Math.max(0, +(props.modelValue + delta).toFixed(1)));
}

async function startEdit() {
    editing.value = true;
    await nextTick();
    inputRef.value?.focus();
    inputRef.value?.select();
}

function saveInput() {
    const raw = parseFloat(inputRef.value?.value ?? '');
    emit('update', Math.max(0, isNaN(raw) ? 0 : +raw.toFixed(1)));
    editing.value = false;
}

function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter')  { inputRef.value?.blur(); }
    if (e.key === 'Escape') { editing.value = false; }
}
</script>
