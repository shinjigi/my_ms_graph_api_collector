/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
const props = defineProps();
const emit = defineEmits();
const hasApproved = computed(() => props.proposal.entries.some(e => e.approved && !e.submitted));
function toggleApproved(idx) {
    const entries = props.proposal.entries.map((e, i) => i === idx ? { ...e, approved: !e.approved } : e);
    emit('patch', { entries });
}
function updateHours(idx, event) {
    const val = parseFloat(event.target.value);
    if (isNaN(val) || val < 0)
        return;
    const entries = props.proposal.entries.map((e, i) => i === idx ? { ...e, inferredHours: val } : e);
    const total = entries.reduce((s, e) => s + e.inferredHours, 0);
    emit('patch', { entries, totalHours: Math.round(total * 100) / 100 });
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['btn-hook']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-primary']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
    ...{ class: "analysis-card" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "card-header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
    ...{ class: "panel-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "balance" },
    ...{ class: (__VLS_ctx.balanceOk ? 'balance-ok' : 'balance-warn') },
});
(__VLS_ctx.proposal.totalHours.toFixed(2));
(__VLS_ctx.proposal.oreTarget.toFixed(2));
if (!__VLS_ctx.balanceOk) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.hoursBalance > 0 ? '+' : '');
    (__VLS_ctx.hoursBalance.toFixed(2));
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "entries" },
});
for (const [entry, idx] of __VLS_getVForSourceType((__VLS_ctx.proposal.entries))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (idx),
        ...{ class: "entry-row" },
        ...{ class: ({ 'entry-approved': entry.approved, 'entry-submitted': entry.submitted }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        ...{ onChange: (...[$event]) => {
                __VLS_ctx.toggleApproved(idx);
            } },
        type: "checkbox",
        checked: (entry.approved),
        disabled: (entry.submitted),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "entry-type" },
        ...{ class: (`type-${entry.entityType}`) },
    });
    (entry.entityType);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "entry-name" },
        title: (entry.reasoning),
    });
    if (entry.taskId) {
        (entry.taskId);
    }
    (entry.taskName);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        ...{ onChange: (...[$event]) => {
                __VLS_ctx.updateHours(idx, $event);
            } },
        type: "number",
        ...{ class: "entry-hours" },
        value: (entry.inferredHours),
        disabled: (entry.submitted),
        step: "0.25",
        min: "0",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "confidence" },
        ...{ class: (`conf-${entry.confidence}`) },
    });
    (entry.confidence[0]);
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "hooks-section" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "hooks-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.$emit('hook', 'zucchetti', 'fullDaySw');
        } },
    ...{ class: "btn-hook" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.$emit('hook', 'zucchetti', 'halfDaySw');
        } },
    ...{ class: "btn-hook" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.$emit('hook', 'zucchetti', 'halfDayLeave');
        } },
    ...{ class: "btn-hook" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "hooks-section" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "hooks-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.$emit('hook', 'nibol', 'bookDesk');
        } },
    ...{ class: "btn-hook" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.$emit('hook', 'nibol', 'checkIn');
        } },
    ...{ class: "btn-hook" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "card-footer" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.$emit('submit');
        } },
    ...{ class: "btn-primary" },
    disabled: (__VLS_ctx.submitting || !__VLS_ctx.hasApproved),
});
if (__VLS_ctx.submitting) {
}
else {
}
/** @type {__VLS_StyleScopedClasses['analysis-card']} */ ;
/** @type {__VLS_StyleScopedClasses['card-header']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-title']} */ ;
/** @type {__VLS_StyleScopedClasses['balance']} */ ;
/** @type {__VLS_StyleScopedClasses['entries']} */ ;
/** @type {__VLS_StyleScopedClasses['entry-row']} */ ;
/** @type {__VLS_StyleScopedClasses['entry-type']} */ ;
/** @type {__VLS_StyleScopedClasses['entry-name']} */ ;
/** @type {__VLS_StyleScopedClasses['entry-hours']} */ ;
/** @type {__VLS_StyleScopedClasses['confidence']} */ ;
/** @type {__VLS_StyleScopedClasses['hooks-section']} */ ;
/** @type {__VLS_StyleScopedClasses['hooks-label']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-hook']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-hook']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-hook']} */ ;
/** @type {__VLS_StyleScopedClasses['hooks-section']} */ ;
/** @type {__VLS_StyleScopedClasses['hooks-label']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-hook']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-hook']} */ ;
/** @type {__VLS_StyleScopedClasses['card-footer']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-primary']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            hasApproved: hasApproved,
            toggleApproved: toggleApproved,
            updateHours: updateHours,
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
