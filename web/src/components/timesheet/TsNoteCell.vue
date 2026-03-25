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
const displayNote = computed(() => {
    const n = currentNote.value;
    return n.length > 9 ? n.substring(0, 8) + '…' : n;
});

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
