<template>
    <div
        class="tc-note"
        :class="{ empty: !currentNote, editing: editing }"
        :title="currentNote || 'Aggiungi nota…'"
        @click.stop="startEdit"
    >
        <template v-if="!editing">{{ displayNote }}</template>
        <input
            v-else
            ref="inputRef"
            class="tc-note-input"
            :value="currentNote"
            placeholder="Nota…"
            @blur="save"
            @keydown="onKeydown"
            @click.stop
        >
    </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue';
import { useTimesheetStore }       from '../../stores/useTimesheetStore';

const props = defineProps<{ tpId: number; dayIdx: number }>();

const ts      = useTimesheetStore();
const editing = ref(false);
const inputRef = ref<HTMLInputElement | null>(null);

const currentNote = computed(() => ts.getNote(props.tpId, props.dayIdx));
const displayNote = computed(() => currentNote.value);

async function startEdit() {
    if (editing.value) return;
    editing.value = true;
    await nextTick();
    inputRef.value?.focus();
    inputRef.value?.select();
}

function save() {
    const val = inputRef.value?.value.trim() ?? '';
    ts.setNote(props.tpId, props.dayIdx, val);
    editing.value = false;
}

function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter')  { inputRef.value?.blur(); }
    if (e.key === 'Escape') { editing.value = false; }
}
</script>

<style scoped>
.tc-note {
    font-size: 0.62rem; color: color-mix(in oklch, var(--color-base-content) 45%, transparent); line-height: 1.15;
    overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    margin-top: 1px; cursor: pointer; min-height: 10px; position: relative; text-align: center;
}
.tc-note.editing { overflow: visible; white-space: normal; z-index: 200; }
.tc-note.empty::after { content: '·'; opacity: 0; font-size: 0.7rem; transition: opacity 0.15s; }
.tc-note:not(.empty):hover { text-decoration: underline dotted; }
.tc-note-input {
    position: absolute; left: 50%; transform: translateX(-50%); top: -2px;
    width: 150px; z-index: 200;
    background: var(--color-base-200); border: 1px solid var(--color-primary);
    border-radius: 5px; box-shadow: 0 3px 10px #0006;
    font-size: 0.72rem; padding: 3px 7px; outline: none; font-weight: 400;
    color: #fff; caret-color: var(--color-primary);
}
</style>
