<template>
    <aside class="w-56 bg-base-100 flex flex-col border-r border-base-300 shrink-0">
        <div class="p-4 border-b border-base-300">
            <div class="flex items-center gap-2">
                <div class="w-9 h-9 bg-primary rounded-xl flex items-center justify-center text-primary-content font-bold text-sm shadow">AP</div>
                <div>
                    <div class="font-bold text-sm leading-tight">Activity Portal</div>
                    <div class="text-xs text-base-content/40">your-username · shinjigi</div>
                </div>
            </div>
        </div>
        <nav class="flex-1 p-2 overflow-y-auto">
            <div class="text-xs text-base-content/30 font-semibold px-3 pt-3 pb-1 uppercase tracking-wider">Viste</div>
            <ul class="menu menu-sm gap-0.5">
                <li v-for="item in navItems" :key="item.view">
                    <RouterLink
                        class="nav-link rounded-lg"
                        :to="`/${item.view}/${currentDateStr}`"
                        active-class="active"
                    >
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="item.icon"/>
                        </svg>
                        {{ item.label }}
                    </RouterLink>
                </li>
            </ul>
            <div class="text-xs text-base-content/30 font-semibold px-3 pt-4 pb-1 uppercase tracking-wider">Sorgenti</div>
            <ul class="menu menu-sm gap-0.5">
                <li><a class="rounded-lg opacity-60 hover:opacity-100 text-xs"><span class="commit-dot source-git"></span> Git (610)</a></li>
                <li><a class="rounded-lg opacity-60 hover:opacity-100 text-xs"><span class="commit-dot source-svn"></span> SVN</a></li>
                <li><a class="rounded-lg opacity-60 hover:opacity-100 text-xs"><span class="commit-dot source-teams"></span> Teams / Mail</a></li>
            </ul>
        </nav>
        <div class="p-3 border-t border-base-300">
            <div class="flex items-center gap-2">
                <div class="avatar placeholder">
                    <div class="bg-neutral text-neutral-content rounded-full w-7">
                        <span class="text-xs">LD</span>
                    </div>
                </div>
                <div class="text-xs">
                    <div class="font-medium">L. De Pinto</div>
                    <div class="text-base-content/40">Altroconsumo</div>
                </div>
            </div>
        </div>
    </aside>
</template>

<script setup lang="ts">
import { computed }      from 'vue';
import { usePickerStore } from '../../stores/usePickerStore';
import type { ActiveView } from '../../types';

const picker = usePickerStore();

const currentDateStr = computed(() => {
    const d = picker.pickerSelected;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
});

const navItems: { view: ActiveView; label: string; icon: string }[] = [
    { view:'dashboard',  label:'Dashboard',  icon:'M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z' },
    { view:'timesheet',  label:'Timesheet',  icon:'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
    { view:'activity',   label:'Activity',   icon:'M13 10V3L4 14h7v7l9-11h-7z' },
    { view:'teams',      label:'Teams',      icon:'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' },
    { view:'browser',    label:'Browser',    icon:'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9' },
];
</script>
