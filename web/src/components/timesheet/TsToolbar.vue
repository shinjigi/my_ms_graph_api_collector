<template>
    <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2">
            <div class="card-title text-sm">Timesheet settimanale</div>
        </div>
        <div class="flex items-center gap-2">
            <TsZucchettiBar />
            <div class="w-px h-5 bg-base-300"></div>
            <TsTpBar ref="tpBarRef" @open-verifica="$emit('open-verifica')" />
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import TsZucchettiBar from './TsZucchettiBar.vue';
import TsTpBar        from './TsTpBar.vue';

defineEmits<{ (e: 'open-verifica'): void }>();

const tpBarRef = ref<InstanceType<typeof TsTpBar> | null>(null);

defineExpose({
    get submitMsg()    { return tpBarRef.value?.submitMsg ?? ''; },
    get submitMsgCls() { return tpBarRef.value?.submitMsgCls ?? ''; },
});
</script>
