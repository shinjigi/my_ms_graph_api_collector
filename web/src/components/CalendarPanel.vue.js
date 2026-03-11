/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
const props = defineProps();
const sortedEvents = computed(() => {
    if (!props.signals)
        return [];
    return [...props.signals.calendar].sort((a, b) => (a.start?.dateTime ?? '').localeCompare(b.start?.dateTime ?? ''));
});
function formatTime(dt) {
    if (!dt)
        return '';
    return new Date(dt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({
    ...{ class: "calendar-panel" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
    ...{ class: "panel-title" },
});
if (!__VLS_ctx.signals) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "empty" },
    });
}
else {
    if (__VLS_ctx.signals.calendar.length > 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({});
        for (const [ev] of __VLS_getVForSourceType((__VLS_ctx.sortedEvents))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                key: (ev.id),
                ...{ class: "event-item" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "event-time" },
            });
            (__VLS_ctx.formatTime(ev.start?.dateTime));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "event-subject" },
            });
            (ev.subject);
            if (ev.attendees?.length) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "event-attendees" },
                });
                (ev.attendees.length);
            }
        }
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "empty" },
        });
    }
    if (__VLS_ctx.signals.teams.length > 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "signal-section" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "badge badge-teams" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "signal-count" },
        });
        (__VLS_ctx.signals.teams.length);
    }
    if (__VLS_ctx.signals.gitCommits.length > 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "signal-section" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "badge badge-git" },
        });
        for (const [c] of __VLS_getVForSourceType((__VLS_ctx.signals.gitCommits))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                key: (c.hash),
                ...{ class: "commit-item" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "commit-repo" },
            });
            (c.repo);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "commit-msg" },
            });
            (c.message);
        }
    }
    if (__VLS_ctx.signals.svnCommits.length > 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "signal-section" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "badge badge-svn" },
        });
        for (const [c] of __VLS_getVForSourceType((__VLS_ctx.signals.svnCommits))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                key: (c.revision),
                ...{ class: "commit-item" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "commit-repo" },
            });
            (c.revision);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "commit-msg" },
            });
            (c.message);
        }
    }
}
/** @type {__VLS_StyleScopedClasses['calendar-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-title']} */ ;
/** @type {__VLS_StyleScopedClasses['empty']} */ ;
/** @type {__VLS_StyleScopedClasses['event-item']} */ ;
/** @type {__VLS_StyleScopedClasses['event-time']} */ ;
/** @type {__VLS_StyleScopedClasses['event-subject']} */ ;
/** @type {__VLS_StyleScopedClasses['event-attendees']} */ ;
/** @type {__VLS_StyleScopedClasses['empty']} */ ;
/** @type {__VLS_StyleScopedClasses['signal-section']} */ ;
/** @type {__VLS_StyleScopedClasses['badge']} */ ;
/** @type {__VLS_StyleScopedClasses['badge-teams']} */ ;
/** @type {__VLS_StyleScopedClasses['signal-count']} */ ;
/** @type {__VLS_StyleScopedClasses['signal-section']} */ ;
/** @type {__VLS_StyleScopedClasses['badge']} */ ;
/** @type {__VLS_StyleScopedClasses['badge-git']} */ ;
/** @type {__VLS_StyleScopedClasses['commit-item']} */ ;
/** @type {__VLS_StyleScopedClasses['commit-repo']} */ ;
/** @type {__VLS_StyleScopedClasses['commit-msg']} */ ;
/** @type {__VLS_StyleScopedClasses['signal-section']} */ ;
/** @type {__VLS_StyleScopedClasses['badge']} */ ;
/** @type {__VLS_StyleScopedClasses['badge-svn']} */ ;
/** @type {__VLS_StyleScopedClasses['commit-item']} */ ;
/** @type {__VLS_StyleScopedClasses['commit-repo']} */ ;
/** @type {__VLS_StyleScopedClasses['commit-msg']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            sortedEvents: sortedEvents,
            formatTime: formatTime,
        };
    },
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
