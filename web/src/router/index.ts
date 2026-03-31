/**
 * Application router.
 * URL schema: /:view/:date  (e.g. /dashboard/2026-03-17, /timesheet/2026-03-17)
 * The date segment always drives the picker store.
 */
import { createRouter, createWebHashHistory } from 'vue-router';
import type { ActiveView } from '../types';

const VALID_VIEWS: ActiveView[] = ['dashboard', 'timesheet', 'activity', 'teams', 'browser'];

import { dateToString } from "@shared/dates";

export const router = createRouter({
    history: createWebHashHistory(),
    routes: [
        // Root → redirect to dashboard/today
        {
            path: '/',
            redirect: () => `/dashboard/${dateToString()}`,
        },
        // /:view (no date) → append today
        {
            path: '/:view',
            redirect: (to) => `/${to.params.view}/${dateToString()}`,
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
                    return `/${view}/${dateToString()}`;
                }
            },
        },
        // Catch-all
        { path: '/:pathMatch(.*)*', redirect: '/' },
    ],
});
