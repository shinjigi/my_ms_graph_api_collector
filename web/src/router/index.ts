/**
 * Application router.
 * URL schema: /:view/:date  (e.g. /dashboard/2026-03-17, /timesheet/2026-03-17)
 * The date segment always drives the picker store.
 */
import { createRouter, createWebHashHistory } from 'vue-router';
import type { ActiveView } from '../types';

const VALID_VIEWS: ActiveView[] = ['dashboard', 'timesheet', 'activity', 'teams', 'browser'];

function todayStr(): string {
    const d = new Date();
    const yr  = d.getFullYear();
    const mo  = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${yr}-${mo}-${day}`;
}

export const router = createRouter({
    history: createWebHashHistory(),
    routes: [
        // Root → redirect to dashboard/today
        {
            path: '/',
            redirect: () => `/dashboard/${todayStr()}`,
        },
        // /:view (no date) → append today
        {
            path: '/:view',
            redirect: (to) => `/${to.params.view}/${todayStr()}`,
        },
        // Main route
        {
            path:      '/:view/:date',
            component: () => import('../views/PortalView.vue'),
            props:     true,
            beforeEnter(to) {
                const view = to.params.view as string;
                const date = to.params.date as string;
                if (!VALID_VIEWS.includes(view as ActiveView)) {
                    return `/dashboard/${date}`;
                }
                if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                    return `/${view}/${todayStr()}`;
                }
            },
        },
        // Catch-all
        { path: '/:pathMatch(.*)*', redirect: '/' },
    ],
});
