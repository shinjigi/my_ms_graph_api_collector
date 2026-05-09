import { useTimesheetStore } from '../stores/useTimesheetStore';
import { locationEmoji, locationTitle, giustActivityEmojis } from '../utils';
import type { Day } from '../types';

export interface Badge {
    emoji: string;
    title: string;
}

export function useZucchettiBadges() {
    const ts = useTimesheetStore();

    const getBadges = (idx: number): Badge[] => {
        const d = ts.days[idx];
        if (!d) return [];

        const badges: Badge[] = [];
        
        // 1. Location badge
        if (d.location) {
            badges.push({ 
                emoji: locationEmoji(d.location), 
                title: locationTitle(d.location) 
            });
        }

        // 2. Activity / Justification badges
        const giustificativi = ts.weekData?.days[idx]?.zucchetti?.giustificativi ?? [];
        for (const emoji of giustActivityEmojis(giustificativi)) {
            badges.push({ emoji, title: emoji });
        }

        return badges;
    };

    return {
        getBadges
    };
}
