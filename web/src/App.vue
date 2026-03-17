<template>
    <div class="flex h-screen overflow-hidden bg-base-200">
        <AppSidebar />
        <div class="flex-1 flex flex-col overflow-hidden">
            <DayPickerHeader />
            <main class="flex-1 overflow-auto p-4">
                <RouterView />
            </main>
        </div>

        <!-- AI FAB -->
        <button class="fixed bottom-4 right-4 btn btn-primary btn-circle shadow-lg z-50" @click="ui.toggleAiChat()" title="AI Assistant">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-3 3-3-3z"/>
            </svg>
        </button>

        <!-- Email modal -->
        <dialog class="modal modal-bottom sm:modal-middle" :open="ui.emailModalId !== null">
            <div class="modal-box max-w-xl" v-if="openEmail">
                <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" @click="ui.closeEmail()">✕</button>
                <div class="flex items-start gap-2 mb-1">
                    <span class="badge badge-xs" :class="openEmail.dir === 'in' ? 'badge-success' : 'badge-info'">
                        {{ openEmail.dir === 'in' ? '↓ Ricevuta' : '↑ Inviata' }}
                    </span>
                    <h3 class="font-bold text-sm flex-1">{{ openEmail.subject }}</h3>
                </div>
                <div class="text-xs text-base-content/40 mb-1">
                    {{ openEmail.dir === 'in' ? 'Da' : 'A' }}: {{ openEmail.dir === 'in' ? openEmail.from : openEmail.to }} · {{ openEmail.time }}
                </div>
                <div class="divider my-2"></div>
                <div class="text-sm leading-relaxed whitespace-pre-line bg-base-200 rounded-lg p-4 max-h-64 overflow-y-auto">
                    {{ openEmail.body }}
                </div>
                <div class="modal-action mt-3">
                    <button class="btn btn-sm" @click="ui.closeEmail()">Chiudi</button>
                </div>
            </div>
            <form method="dialog" class="modal-backdrop"><button @click="ui.closeEmail()">close</button></form>
        </dialog>
    </div>
</template>

<script setup lang="ts">
import { computed }        from 'vue';
import { useUiStore }      from './stores/useUiStore';
import { useDayStore }     from './stores/useDayStore';
import AppSidebar          from './components/layout/AppSidebar.vue';
import DayPickerHeader     from './components/layout/DayPickerHeader.vue';

const ui  = useUiStore();
const day = useDayStore();

const openEmail = computed(() => {
    if (ui.emailModalId === null) return null;
    return day.emails[ui.emailModalId] ?? null;
});
</script>
