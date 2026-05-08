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
            <span class="tc-val"
                  :class="[extraValCls, cellMode === 'hint-differ' ? 'tc-hint-differ' : '']"
                  :title="cellMode === 'hint-differ' ? `AI: ${hintVal}h` : undefined"
                  @click="startEdit">
                {{ modelValue > 0 ? modelValue : '—' }}
            </span>
        </template>
        <button class="tc-btn tc-plus" @click="adjust(0.5)" tabindex="-1">+</button>
        <button v-if="modelValue > 0" class="tc-clear" @click="emit('update', 0)" title="Cancella" tabindex="-1">✕</button>
    </div>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue';

const props = defineProps<{
    modelValue:   number;
    extraValCls?: string;
    /** Current day total delta (zuc − tp). When |dayDelta| < 0.5 and it
     *  shares the sign of the step, the button moves by dayDelta instead
     *  of the fixed 0.5 to land exactly on zero without overshooting. */
    dayDelta?:    number;
    /** AI-suggested value for this cell — used for hint-differ tooltip. */
    hintVal?:     number;
    /** Visual state driven by parent (TsRow/WorkTpPanel). */
    cellMode?:    import('../types').CellMode;
}>();
const emit = defineEmits<{ update: [val: number] }>();

const editing  = ref(false);
const inputRef = ref<HTMLInputElement | null>(null);

function adjust(step: number) {
    const d = props.dayDelta ?? 0;
    const actual = (d !== 0 && Math.abs(d) < Math.abs(step) && Math.sign(step) === Math.sign(d))
        ? d
        : step;
    emit('update', Math.max(0, +(props.modelValue + actual).toFixed(1)));
}

async function startEdit() {
    editing.value = true;
    await nextTick();
    inputRef.value?.focus();
    inputRef.value?.select();
}

function saveInput() {
    const raw = Number.parseFloat(inputRef.value?.value ?? '');
    emit('update', Math.max(0, Number.isNaN(raw) ? 0 : +raw.toFixed(1)));
    editing.value = false;
}

function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter')  { inputRef.value?.blur(); }
    if (e.key === 'Escape') { editing.value = false; }
}
</script>

<style scoped>
/* ── Layout ── */
.tc-wrap { display: inline-flex; align-items: center; gap: 3px; position: relative; }
.tc-btn {
    opacity: 0.4; width: 17px; height: 17px; border-radius: 50%; padding: 0;
    border: 1px solid color-mix(in oklch, var(--color-primary) 50%, transparent); color: var(--color-primary);
    font-size: 13px; line-height: 1; cursor: pointer; background: transparent;
    display: flex; align-items: center; justify-content: center;
    transition: opacity 0.12s, background 0.1s; flex-shrink: 0;
}
.tc-btn:hover { background: color-mix(in oklch, var(--color-primary) 25%, transparent); opacity: 1; }
.tc-btn.invisible { pointer-events: none; opacity: 0 !important; }
.tc-wrap:hover .tc-btn:not(.invisible) { opacity: 1; }
.tc-val {
    cursor: pointer; min-width: 22px; text-align: center;
    border-radius: 4px; padding: 1px 2px;
    transition: color 0.1s, background 0.1s;
}
.tc-val:hover { color: var(--color-primary); background: color-mix(in oklch, var(--color-primary) 10%, transparent); }
.tc-input {
    width: 38px; text-align: center;
    background: var(--color-base-200); border: 1px solid var(--color-primary);
    border-radius: 4px; font-size: 0.75rem; padding: 1px 3px;
    outline: none; color: var(--color-primary); font-weight: 600;
    appearance: none;
}

/* ── States ── */
.tc-hint-differ {
    text-decoration: underline dotted oklch(var(--wa) / 0.6);
    cursor: help;
}
.tc-clear {
    position: absolute; right: -15px; top: -5px;
    font-size: 0.77rem; color: oklch(var(--er) / 0.5); cursor: pointer;
    background: transparent; border: none; padding: 0;
    opacity: 0; transition: opacity 0.15s, color 0.1s;
    z-index: 5;
}
.tc-wrap:hover .tc-clear { opacity: 1; }
.tc-clear:hover { color: oklch(var(--er)); transform: scale(1.1); }
</style>
