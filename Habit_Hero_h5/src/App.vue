<template>
  <div id="app">
    <SyncGate><router-view :key="`${session?.familyId}:${session?.childId}`" /></SyncGate>
    <Toast v-if="toast" :message="toast.message" :type="toast.type" />
  </div>
</template>

<script setup lang="ts">
import { provide } from 'vue';
import { useSync } from './composables/useAppData';
const { session } = useSync();
import { useToast } from './composables/useToast';
import Toast from './components/Toast.vue';
import SyncGate from './components/SyncGate.vue';

const { toast, showToast } = useToast();
provide('showToast', showToast);
</script>

<style scoped>
#app {
  min-height: 100vh;
}
</style>

