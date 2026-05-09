import { defineStore }  from 'pinia';
import { ref }          from 'vue';
import type { QuickSortState } from '../types';

export const useUiStore = defineStore('ui', () => {
    const weVisible       = ref(false);
    const browserExpanded = ref(false);
    const quickFilterSignals  = ref(false);
    const quickSearch         = ref('');
    const quickSort           = ref<QuickSortState>({ field: 'state', dir: 1 });
    const pinnedFilterSignals = ref(false);
    const pinnedSearch        = ref('');
    const pinnedSort          = ref<QuickSortState>({ field: 'state', dir: 1 });
    const aiChatOpen      = ref(false);
    const emailModalId    = ref<number | null>(null);

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

    function sortPinned(field: QuickSortState['field']) {
        if (pinnedSort.value.field === field) {
            pinnedSort.value.dir = pinnedSort.value.dir === 1 ? -1 : 1;
        } else {
            pinnedSort.value = { field, dir: 1 };
        }
    }

    return {
        weVisible, browserExpanded,
        quickFilterSignals, quickSearch, quickSort,
        pinnedFilterSignals, pinnedSearch, pinnedSort,
        aiChatOpen, emailModalId,
        toggleWE, toggleBrowser, toggleAiChat,
        openEmail, closeEmail, sortQuick, sortPinned,
    };
}, {
    persist: {
        key:  'ui.prefs',
        pick: [
            'weVisible',
            'browserExpanded',
            'quickFilterSignals',
            'pinnedFilterSignals',
            'quickSort',
            'pinnedSort',
        ],
    },
});
