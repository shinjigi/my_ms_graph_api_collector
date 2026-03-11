/// <reference types="../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { onMounted } from 'vue';
import { useProposals } from './composables/useProposals';
import CalendarPanel from './components/CalendarPanel.vue';
import AnalysisCard from './components/AnalysisCard.vue';
import TaskPanel from './components/TaskPanel.vue';
const { dates, selectedDate, proposal, signals, tpItems, loading, submitting, error, hoursBalance, balanceOk, fetchDates, fetchDay, patchProposal, submitDay, fetchTpItems, runHook, } = useProposals();
onMounted(async () => {
    await fetchDates();
    await fetchTpItems();
});
async function handleSubmit() {
    const result = await submitDay();
    if (result.submitted > 0) {
        alert(`Inviate ${result.submitted} entries a TargetProcess.`);
    }
    if (result.errors.length > 0) {
        alert(`Errori: ${JSON.stringify(result.errors)}`);
    }
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['app-header']} */ ;
/** @type {__VLS_StyleScopedClasses['date-nav']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "app" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "app-header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "date-nav" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
    ...{ onChange: (...[$event]) => {
            __VLS_ctx.fetchDay(__VLS_ctx.selectedDate);
        } },
    value: (__VLS_ctx.selectedDate),
});
for (const [d] of __VLS_getVForSourceType((__VLS_ctx.dates))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
        key: (d),
        value: (d),
    });
    (d);
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.fetchDates) },
    disabled: (__VLS_ctx.loading),
    ...{ class: "btn-icon" },
});
if (__VLS_ctx.error) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "badge-error" },
    });
    (__VLS_ctx.error);
}
if (__VLS_ctx.loading) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "loading" },
    });
}
else if (__VLS_ctx.proposal) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "layout-3col" },
    });
    /** @type {[typeof CalendarPanel, ]} */ ;
    // @ts-ignore
    const __VLS_0 = __VLS_asFunctionalComponent(CalendarPanel, new CalendarPanel({
        signals: (__VLS_ctx.signals),
    }));
    const __VLS_1 = __VLS_0({
        signals: (__VLS_ctx.signals),
    }, ...__VLS_functionalComponentArgsRest(__VLS_0));
    /** @type {[typeof AnalysisCard, ]} */ ;
    // @ts-ignore
    const __VLS_3 = __VLS_asFunctionalComponent(AnalysisCard, new AnalysisCard({
        ...{ 'onPatch': {} },
        ...{ 'onSubmit': {} },
        ...{ 'onHook': {} },
        proposal: (__VLS_ctx.proposal),
        balanceOk: (__VLS_ctx.balanceOk),
        hoursBalance: (__VLS_ctx.hoursBalance),
        submitting: (__VLS_ctx.submitting),
        selectedDate: (__VLS_ctx.selectedDate),
    }));
    const __VLS_4 = __VLS_3({
        ...{ 'onPatch': {} },
        ...{ 'onSubmit': {} },
        ...{ 'onHook': {} },
        proposal: (__VLS_ctx.proposal),
        balanceOk: (__VLS_ctx.balanceOk),
        hoursBalance: (__VLS_ctx.hoursBalance),
        submitting: (__VLS_ctx.submitting),
        selectedDate: (__VLS_ctx.selectedDate),
    }, ...__VLS_functionalComponentArgsRest(__VLS_3));
    let __VLS_6;
    let __VLS_7;
    let __VLS_8;
    const __VLS_9 = {
        onPatch: (__VLS_ctx.patchProposal)
    };
    const __VLS_10 = {
        onSubmit: (__VLS_ctx.handleSubmit)
    };
    const __VLS_11 = {
        onHook: (__VLS_ctx.runHook)
    };
    var __VLS_5;
    /** @type {[typeof TaskPanel, ]} */ ;
    // @ts-ignore
    const __VLS_12 = __VLS_asFunctionalComponent(TaskPanel, new TaskPanel({
        ...{ 'onPatch': {} },
        items: (__VLS_ctx.tpItems),
        proposal: (__VLS_ctx.proposal),
    }));
    const __VLS_13 = __VLS_12({
        ...{ 'onPatch': {} },
        items: (__VLS_ctx.tpItems),
        proposal: (__VLS_ctx.proposal),
    }, ...__VLS_functionalComponentArgsRest(__VLS_12));
    let __VLS_15;
    let __VLS_16;
    let __VLS_17;
    const __VLS_18 = {
        onPatch: (__VLS_ctx.patchProposal)
    };
    var __VLS_14;
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "empty-state" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.code, __VLS_intrinsicElements.code)({});
}
/** @type {__VLS_StyleScopedClasses['app']} */ ;
/** @type {__VLS_StyleScopedClasses['app-header']} */ ;
/** @type {__VLS_StyleScopedClasses['date-nav']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['badge-error']} */ ;
/** @type {__VLS_StyleScopedClasses['loading']} */ ;
/** @type {__VLS_StyleScopedClasses['layout-3col']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            CalendarPanel: CalendarPanel,
            AnalysisCard: AnalysisCard,
            TaskPanel: TaskPanel,
            dates: dates,
            selectedDate: selectedDate,
            proposal: proposal,
            signals: signals,
            tpItems: tpItems,
            loading: loading,
            submitting: submitting,
            error: error,
            hoursBalance: hoursBalance,
            balanceOk: balanceOk,
            fetchDates: fetchDates,
            fetchDay: fetchDay,
            patchProposal: patchProposal,
            runHook: runHook,
            handleSubmit: handleSubmit,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
