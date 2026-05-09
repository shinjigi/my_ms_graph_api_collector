/**
 * Application router.
 * URL schema: /:view/:date  (e.g. /dashboard/2026-03-17, /timesheet/2026-03-17)
 * The date segment always drives the picker store.
 */
import { createRouter, createWebHashHistory } from 'vue-router';
import { getMonday } from "@shared/dates";
import { usePickerStore } from '../stores/usePickerStore';
import { useTimesheetStore } from '../stores/useTimesheetStore';
import { useAnalysisStore } from '../stores/useAnalysisStore';


export const router = createRouter({
    history: createWebHashHistory(),
    routes: [
        { path: '/', redirect: () => `/dashboard/${new Date().toISOString().split('T')[0]}` },
        { path: '/:view', redirect: (to) => `/${to.params.view}/${new Date().toISOString().split('T')[0]}` },
        {
            path: '/dashboard/:date',
            component: () => import('../views/DashboardView.vue'),
        },
        {
            path: '/timesheet/:date',
            component: () => import('../components/timesheet/TimesheetView.vue'),
        },
        {
            path: '/activity/:date',
            component: () => import('../components/activity/ActivityView.vue'),
        },
        {
            path: '/teams/:date',
            component: () => import('../components/teams/TeamsView.vue'),
        },
        {
            path: '/browser/:date',
            component: () => import('../components/browser/BrowserView.vue'),
        },
        { path: '/:pathMatch(.*)*', redirect: '/' },
    ],
});

router.afterEach((to) => {
    const date = to.params.date as string;

    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        const parts = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (parts) {
            const picker = usePickerStore();
            const ts = useTimesheetStore();
            const analysis = useAnalysisStore();

            const yr = Number.parseInt(parts[1], 10);
            const mo = Number.parseInt(parts[2], 10) - 1;
            const d = Number.parseInt(parts[3], 10);
            const current = picker.pickerSelected;

            if (current.getFullYear() !== yr || current.getMonth() !== mo || current.getDate() !== d) {
                picker.setFromDate(new Date(yr, mo, d));
            }

            const monday = getMonday(new Date(yr, mo, d));
            ts.fetchWeekData(monday);
            analysis.loadWeekHints(monday);
        }
    }
});
