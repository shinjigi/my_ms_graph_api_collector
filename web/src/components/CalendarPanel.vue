<template>
    <aside class="calendar-panel">
        <h2 class="panel-title">Calendario</h2>

        <div v-if="!signals" class="empty">Nessun dato</div>

        <template v-else>
            <!-- Calendar events -->
            <section v-if="signals.calendar.length > 0">
                <div
                    v-for="ev in sortedEvents"
                    :key="ev.id"
                    class="event-item"
                >
                    <span class="event-time">{{ formatTime(ev.start?.dateTime) }}</span>
                    <span class="event-subject">{{ ev.subject }}</span>
                    <span v-if="ev.attendees?.length" class="event-attendees">
                        {{ ev.attendees.length }} partecipanti
                    </span>
                </div>
            </section>
            <div v-else class="empty">Nessun evento</div>

            <!-- Teams messages summary -->
            <section class="signal-section" v-if="signals.teams.length > 0">
                <span class="badge badge-teams">Teams</span>
                <span class="signal-count">{{ signals.teams.length }} messaggi</span>
            </section>

            <!-- Git commits -->
            <section class="signal-section" v-if="signals.gitCommits.length > 0">
                <span class="badge badge-git">Git</span>
                <div v-for="c in signals.gitCommits" :key="c.hash" class="commit-item">
                    <span class="commit-repo">{{ c.repo }}</span>
                    <span class="commit-msg">{{ c.message }}</span>
                </div>
            </section>

            <!-- SVN commits -->
            <section class="signal-section" v-if="signals.svnCommits.length > 0">
                <span class="badge badge-svn">SVN</span>
                <div v-for="c in signals.svnCommits" :key="c.revision" class="commit-item">
                    <span class="commit-repo">r{{ c.revision }}</span>
                    <span class="commit-msg">{{ c.message }}</span>
                </div>
            </section>
        </template>
    </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { AggregatedDay, CalendarEvent } from '../types';

const props = defineProps<{ signals: AggregatedDay | null }>();

const sortedEvents = computed<CalendarEvent[]>(() => {
    if (!props.signals) return [];
    return [...props.signals.calendar].sort((a, b) =>
        (a.start?.dateTime ?? '').localeCompare(b.start?.dateTime ?? '')
    );
});

function formatTime(dt: string | undefined): string {
    if (!dt) return '';
    return new Date(dt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}
</script>

<style scoped>
.calendar-panel {
    background:   #141620;
    border-right: 1px solid #2e3148;
    overflow-y:   auto;
    padding:      0.75rem;
}
.panel-title { margin: 0 0 0.75rem; font-size: 0.85rem; color: #7c85f5; text-transform: uppercase; letter-spacing: 0.05em; }
.empty { color: #666; font-size: 0.8rem; }

.event-item {
    display:       flex;
    flex-direction: column;
    padding:       0.4rem 0;
    border-bottom: 1px solid #1e2030;
}
.event-time     { font-size: 0.75rem; color: #7c85f5; font-weight: 600; }
.event-subject  { font-size: 0.82rem; color: #d0d0e0; }
.event-attendees { font-size: 0.72rem; color: #666; }

.signal-section { margin-top: 1rem; }

.badge {
    display:       inline-block;
    font-size:     0.7rem;
    font-weight:   700;
    padding:       0.1rem 0.4rem;
    border-radius: 3px;
    margin-bottom: 0.3rem;
    text-transform: uppercase;
}
.badge-teams { background: #4a3a6e; color: #c4a9ff; }
.badge-git   { background: #2d4a2d; color: #7ecf7e; }
.badge-svn   { background: #4a3a2d; color: #f0b060; }

.signal-count { font-size: 0.8rem; color: #aaa; margin-left: 0.5rem; }

.commit-item {
    display:     flex;
    gap:         0.4rem;
    font-size:   0.75rem;
    padding:     0.2rem 0;
    color:       #aaa;
}
.commit-repo { color: #7ecf7e; flex-shrink: 0; }
.commit-msg  { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
