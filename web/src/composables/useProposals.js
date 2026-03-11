import { ref, computed } from 'vue';
const API = '/api';
export function useProposals() {
    const dates = ref([]);
    const selectedDate = ref('');
    const current = ref(null);
    const tpItems = ref([]);
    const loading = ref(false);
    const submitting = ref(false);
    const error = ref(null);
    const proposal = computed(() => current.value?.proposal ?? null);
    const signals = computed(() => current.value?.signals ?? null);
    const hoursBalance = computed(() => {
        if (!proposal.value)
            return 0;
        return Math.round((proposal.value.totalHours - proposal.value.oreTarget) * 100) / 100;
    });
    const balanceOk = computed(() => Math.abs(hoursBalance.value) < 0.01);
    async function fetchDates() {
        loading.value = true;
        error.value = null;
        try {
            const res = await fetch(`${API}/proposals`);
            dates.value = await res.json();
            if (dates.value.length > 0 && !selectedDate.value) {
                selectedDate.value = dates.value[0];
                await fetchDay(selectedDate.value);
            }
        }
        catch (e) {
            error.value = e.message;
        }
        finally {
            loading.value = false;
        }
    }
    async function fetchDay(date) {
        loading.value = true;
        error.value = null;
        try {
            const res = await fetch(`${API}/proposals/${date}`);
            current.value = await res.json();
            selectedDate.value = date;
        }
        catch (e) {
            error.value = e.message;
        }
        finally {
            loading.value = false;
        }
    }
    async function patchProposal(patch) {
        if (!selectedDate.value)
            return;
        error.value = null;
        try {
            const res = await fetch(`${API}/proposals/${selectedDate.value}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(patch),
            });
            const updated = await res.json();
            if (current.value) {
                current.value = { ...current.value, proposal: updated };
            }
        }
        catch (e) {
            error.value = e.message;
        }
    }
    async function submitDay() {
        if (!selectedDate.value)
            return { submitted: 0, errors: [] };
        submitting.value = true;
        error.value = null;
        try {
            const res = await fetch(`${API}/submit/${selectedDate.value}`, { method: 'POST' });
            const data = await res.json();
            if (!res.ok)
                throw new Error(JSON.stringify(data));
            // Refresh the proposal to reflect submitted state
            await fetchDay(selectedDate.value);
            return data;
        }
        catch (e) {
            error.value = e.message;
            return { submitted: 0, errors: [error.value] };
        }
        finally {
            submitting.value = false;
        }
    }
    async function fetchTpItems() {
        try {
            const res = await fetch(`${API}/hooks/tp-items`);
            tpItems.value = await res.json();
        }
        catch { /* non-critical */ }
    }
    async function runHook(type, action) {
        if (!selectedDate.value)
            return;
        error.value = null;
        try {
            const res = await fetch(`${API}/hooks/${type}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, date: selectedDate.value }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error);
            }
        }
        catch (e) {
            error.value = e.message;
        }
    }
    return {
        dates,
        selectedDate,
        proposal,
        signals,
        tpItems,
        loading,
        submitting,
        error,
        hoursBalance,
        balanceOk,
        fetchDates,
        fetchDay,
        patchProposal,
        submitDay,
        fetchTpItems,
        runHook,
    };
}
