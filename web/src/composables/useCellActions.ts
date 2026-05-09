import { useTimesheetStore } from '../stores/useTimesheetStore';
import { useAnalysisStore } from '../stores/useAnalysisStore';
import { shiftDate } from '@shared/dates';
import type { CellMode } from '../types';

export function useCellActions() {
    const ts = useTimesheetStore();
    const analysis = useAnalysisStore();

    const getHint = (tpId: number, dayIdx: number) => {
        if (!ts.currentMonday) return null;
        return analysis.getHint(tpId, dayIdx, ts.currentMonday);
    };

    const computeCellMode = (tpId: number, dayIdx: number): CellMode => {
        const hint = getHint(tpId, dayIdx);
        const key = `${tpId}_${dayIdx}`;
        const hasEdit = key in ts.hoursEdits;
        const hours = ts.getHours(tpId, dayIdx);

        // Optimization: if the day is already balanced (delta ~ 0) and there are no hours,
        // don't show pulsating "hint-only" buttons to avoid UI noise.
        const delta = ts.totalsRow.delta[dayIdx];
        if (Math.abs(delta) < 0.05 && hours === 0) {
            return 'clean';
        }

        if (!hint || hint.inferredHours <= 0) {
            return hasEdit ? 'user-edit' : 'clean';
        }

        if (hasEdit) return 'user-edit';
        if (hours === 0) return 'hint-only';
        if (+hours.toFixed(1) === +hint.inferredHours.toFixed(1)) return 'hint-match';
        
        return 'hint-differ';
    };

    const acceptHint = (tpId: number, dayIdx: number) => {
        const hint = getHint(tpId, dayIdx);
        if (!hint || !ts.currentMonday) return;

        ts.setHours(tpId, dayIdx, hint.inferredHours);
        
        const noteText = hint.comment || hint.reasoning;
        if (noteText) {
            ts.setNote(tpId, dayIdx, noteText);
        }

        const dateStr = shiftDate(ts.currentMonday, dayIdx);
        analysis.setEntryStatus(dateStr, tpId, 'accepted');
    };

    const dismissHint = (tpId: number, dayIdx: number) => {
        if (!ts.currentMonday) return;
        analysis.dismissHint(tpId, dayIdx, ts.currentMonday);
        ts.clearCellEdit(tpId, dayIdx);
    };

    const updateCell = (tpId: number, dayIdx: number, val: number) => {
        ts.setHours(tpId, dayIdx, val);
        
        if (val === 0) {
            ts.setNote(tpId, dayIdx, '');
        } else {
            const hint = getHint(tpId, dayIdx);
            const noteText = hint?.comment || hint?.reasoning;
            if (noteText) {
                ts.setNote(tpId, dayIdx, noteText);
            }
        }

        // If user overrides an already accepted hint, mark it as overridden in analysis
        const hint = getHint(tpId, dayIdx);
        if (hint?.status === 'accepted' && val !== hint.inferredHours && ts.currentMonday) {
            const dateStr = shiftDate(ts.currentMonday, dayIdx);
            analysis.setEntryStatus(dateStr, tpId, 'overridden');
        }
    };

    const quickAdd = (tpId: number, dayIdx: number) => {
        const hint = getHint(tpId, dayIdx);
        const current = ts.getHours(tpId, dayIdx);

        if (hint && current === 0) {
            acceptHint(tpId, dayIdx);
        } else {
            ts.setHours(tpId, dayIdx, current + 0.5);
        }
        
        ts.schedulePromotion(tpId);
    };

    const activateTask = (tpId: number, dayIdx: number) => {
        ts.setHours(tpId, dayIdx, 0.1);
    };

    const updateNote = (tpId: number, dayIdx: number, text: string) => {
        ts.setNote(tpId, dayIdx, text);
    };

    return {
        getHint,
        computeCellMode,
        acceptHint,
        dismissHint,
        updateCell,
        quickAdd,
        activateTask,
        updateNote
    };
}
