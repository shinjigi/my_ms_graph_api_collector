import { defineStore }          from 'pinia';
import { ref, watch }           from 'vue';
import type { ActiveView, QuickSortState } from '../types';

function loadJson<T>(key: string, fallback: T): T {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
}

const persisted = loadJson<{ weVisible: boolean; quickSort: QuickSortState }>('portal_ui', {
    weVisible:  true,
    quickSort:  { field: 'state', dir: 1 },
});

export const useUiStore = defineStore('ui', () => {
    const activeView      = ref<ActiveView>('dashboard');
    const weVisible       = ref(persisted.weVisible);
    const browserExpanded = ref(false);
    const quickFilterSignals = ref(false);
    const quickSearch     = ref('');
    const quickSort       = ref<QuickSortState>(persisted.quickSort);
    const aiChatOpen      = ref(false);
    const emailModalId    = ref<number | null>(null);

    watch([weVisible, quickSort], () => {
        localStorage.setItem('portal_ui', JSON.stringify({
            weVisible:  weVisible.value,
            quickSort:  quickSort.value,
        }));
    }, { deep: true });

    function setView(v: ActiveView) { activeView.value = v; }
    function toggleWE()             { weVisible.value = !weVisible.value; }
    function toggleBrowser()        { browserExpanded.value = !browserExpanded.value; }
    function toggleAiChat()         { aiChatOpen.value = !aiChatOpen.value; }
    function openEmail(id: number)  { emailModalId.value = id; }
    function closeEmail()           { emailModalId.value = null; }

    function sortQuick(field: QuickSortState['field']) {
        if (quickSort.value.field === field) {
            quickSort.value.dir = quickSort.value.dir === 1 ? -1 : 1;
        } else {
            quickSort.value = { field, dir: 1 };
        }
    }

    return {
        activeView, weVisible, browserExpanded,
        quickFilterSignals, quickSearch, quickSort,
        aiChatOpen, emailModalId,
        setView, toggleWE, toggleBrowser, toggleAiChat,
        openEmail, closeEmail, sortQuick,
    };
});
