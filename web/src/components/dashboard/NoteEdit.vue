<template>
    <div>
        <div v-if="!editing"
             class="cursor-pointer hover:text-base-content/80 transition-colors"
             @click="startEdit">
            <template v-if="value">📝 {{ value }}</template>
            <span v-else class="text-base-content/30 italic">+ Aggiungi nota…</span>
        </div>
        <input v-else
               ref="inputRef"
               type="text"
               class="input input-bordered input-xs w-full text-xs"
               :value="draft"
               placeholder="Nota per oggi…"
               @blur="save"
               @keydown="onKeydown"
        >
    </div>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue';

const props = defineProps<{ value: string }>();
const emit  = defineEmits<{ update: [val: string] }>();

const editing  = ref(false);
const draft    = ref('');
const inputRef = ref<HTMLInputElement | null>(null);

async function startEdit() {
    draft.value   = props.value;
    editing.value = true;
    await nextTick();
    inputRef.value?.focus();
    inputRef.value?.select();
}

function save() {
    emit('update', inputRef.value?.value.trim() ?? '');
    editing.value = false;
}

function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter')  { inputRef.value?.blur(); }
    if (e.key === 'Escape') { editing.value = false; }
}
</script>
