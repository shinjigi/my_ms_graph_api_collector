/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { ref } from 'vue';
const props = defineProps();
const emit = defineEmits();
const searchQuery = ref('');
const searchResults = ref([]);
let searchTimer = null;
async function onSearch() {
    if (searchTimer)
        clearTimeout(searchTimer);
    const q = searchQuery.value.trim();
    if (q.length < 2) {
        searchResults.value = [];
        return;
    }
    searchTimer = setTimeout(async () => {
        try {
            const res = await fetch(`/api/hooks/tp-search?q=${encodeURIComponent(q)}`);
            searchResults.value = await res.json();
        }
        catch {
            searchResults.value = [];
        }
    }, 350);
}
function addItemToProposal(item) {
    // Add 0.5h placeholder entry for the selected item
    const already = props.proposal.entries.some(e => e.taskId === item.id);
    if (already)
        return;
    const entries = [
        ...props.proposal.entries,
        {
            taskId: item.id,
            entityType: item.entityType,
            taskName: item.name,
            inferredHours: 0.5,
            confidence: 'low',
            reasoning: 'Aggiunto manualmente',
            approved: false,
        },
    ];
    emit('patch', { entries });
    searchQuery.value = '';
    searchResults.value = [];
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['search-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['search-item']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({
    ...{ class: "task-panel" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
    ...{ class: "panel-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "search-bar" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
    ...{ onInput: (__VLS_ctx.onSearch) },
    placeholder: "Cerca per ID o parola chiave...",
});
(__VLS_ctx.searchQuery);
if (__VLS_ctx.searchResults.length > 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "search-results" },
    });
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.searchResults))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.searchResults.length > 0))
                        return;
                    __VLS_ctx.addItemToProposal(item);
                } },
            key: (item.id),
            ...{ class: "search-item" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "item-type" },
            ...{ class: (`type-${item.entityType}`) },
        });
        (item.entityType[0]);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "item-id" },
        });
        (item.id);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "item-name" },
        });
        (item.name);
    }
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "items-list" },
});
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.items))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (item.id),
        ...{ class: "item-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "item-type" },
        ...{ class: (`type-${item.entityType}`) },
    });
    (item.entityType[0]);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "item-info" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "item-id" },
    });
    (item.id);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "item-name" },
        title: (item.parentName ?? ''),
    });
    (item.name);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "item-project" },
    });
    (item.projectName);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "item-spent" },
        title: (`${item.timeSpent}h logged total`),
    });
    (item.timeSpent.toFixed(1));
}
if (__VLS_ctx.items.length === 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "empty" },
    });
}
/** @type {__VLS_StyleScopedClasses['task-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-title']} */ ;
/** @type {__VLS_StyleScopedClasses['search-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['search-results']} */ ;
/** @type {__VLS_StyleScopedClasses['search-item']} */ ;
/** @type {__VLS_StyleScopedClasses['item-type']} */ ;
/** @type {__VLS_StyleScopedClasses['item-id']} */ ;
/** @type {__VLS_StyleScopedClasses['item-name']} */ ;
/** @type {__VLS_StyleScopedClasses['items-list']} */ ;
/** @type {__VLS_StyleScopedClasses['item-row']} */ ;
/** @type {__VLS_StyleScopedClasses['item-type']} */ ;
/** @type {__VLS_StyleScopedClasses['item-info']} */ ;
/** @type {__VLS_StyleScopedClasses['item-id']} */ ;
/** @type {__VLS_StyleScopedClasses['item-name']} */ ;
/** @type {__VLS_StyleScopedClasses['item-project']} */ ;
/** @type {__VLS_StyleScopedClasses['item-spent']} */ ;
/** @type {__VLS_StyleScopedClasses['empty']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            searchQuery: searchQuery,
            searchResults: searchResults,
            onSearch: onSearch,
            addItemToProposal: addItemToProposal,
        };
    },
    __typeEmits: {},
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
