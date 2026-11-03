<template>
  <div class="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
    <div class="bg-white p-6 md:p-8 rounded-[2rem] border-[3px] border-black shadow-cartoon">
      <h3 class="font-black text-slate-800 mb-6 text-xl">添加自定义任务</h3>
      <div class="flex flex-col sm:flex-row gap-4">
        <input
          v-model="newItemName"
          placeholder="任务名称 (例如: 遛狗)"
          class="flex-1 p-4 rounded-2xl border-2 border-slate-200 focus:outline-none focus:border-black focus:ring-0 font-bold bg-slate-50 transition-colors"
        />
        <div class="flex gap-3">
          <input
            v-model.number="newItemValue"
            type="number"
            placeholder="分数"
            class="w-24 p-4 rounded-2xl border-2 border-slate-200 focus:outline-none focus:border-black focus:ring-0 font-bold bg-slate-50"
          />
          <input
            v-model="newItemEmoji"
            class="w-20 p-4 rounded-2xl border-2 border-slate-200 text-center text-xl cursor-pointer focus:border-black focus:outline-none bg-slate-50"
            title="输入一个Emoji"
          />
          <Button aria-label="添加任务" @click="handleAdd" variant="success" class="aspect-square flex items-center justify-center p-0 w-16">
            <Plus :size="28" :stroke-width="4" />
          </Button>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div
        v-for="habit in data.habits"
        :key="habit.id"
        class="bg-white p-5 rounded-2xl border-[3px] border-black shadow-sm flex justify-between items-center group hover:-translate-y-1 transition-transform"
      >
        <div class="flex items-center gap-4">
          <div class="w-14 h-14 bg-sky-50 border-2 border-black rounded-2xl flex items-center justify-center text-3xl shadow-sm">
            {{ habit.emoji }}
          </div>
          <div>
            <p class="font-black text-slate-800 text-lg">{{ habit.name }}</p>
            <p class="text-xs text-slate-500 font-bold bg-slate-100 px-2 py-1 rounded inline-block mt-1">奖励 {{ habit.points }} 分</p>
          </div>
        </div>
        <div class="flex gap-2">
          <button
            @click="handleEdit(habit)"
            class="text-slate-300 hover:text-blue-500 p-3 hover:bg-blue-50 rounded-xl transition-all"
            title="编辑"
          >
            <Edit2 :size="22" :stroke-width="2.5" />
          </button>
          <button
            @click="handleRemove(habit.id)"
            class="text-slate-300 hover:text-red-500 p-3 hover:bg-red-50 rounded-xl transition-all"
            title="删除"
          >
            <Trash2 :size="22" :stroke-width="2.5" />
          </button>
        </div>
      </div>
    </div>

    <!-- Edit Modal -->
    <Modal :is-open="isEditModalOpen" title="编辑任务" @close="closeEditModal">
      <div class="space-y-4">
        <div class="flex flex-col gap-4">
          <div>
            <label class="block text-sm font-bold text-slate-500 mb-2">任务名称</label>
            <input
              v-model="editItemName"
              placeholder="任务名称 (例如: 遛狗)"
              class="w-full p-4 rounded-2xl border-2 border-slate-200 focus:outline-none focus:border-black focus:ring-0 font-bold bg-slate-50 transition-colors"
            />
          </div>
          <div>
            <label class="block text-sm font-bold text-slate-500 mb-2">奖励积分</label>
            <input
              v-model.number="editItemValue"
              type="number"
              placeholder="分数"
              class="w-full p-4 rounded-2xl border-2 border-slate-200 focus:outline-none focus:border-black focus:ring-0 font-bold bg-slate-50"
            />
          </div>
          <div>
            <label class="block text-sm font-bold text-slate-500 mb-2">Emoji 表情</label>
            <input
              v-model="editItemEmoji"
              class="w-full p-4 rounded-2xl border-2 border-slate-200 text-center text-xl cursor-pointer focus:border-black focus:outline-none bg-slate-50"
              title="输入一个Emoji"
            />
          </div>
        </div>
        <div class="flex gap-3 justify-end">
          <Button variant="secondary" @click="closeEditModal">取消</Button>
          <Button variant="primary" @click="handleSaveEdit">
            保存修改
          </Button>
        </div>
      </div>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { ref, inject } from 'vue';
import { Plus, Trash2, Edit2 } from 'lucide-vue-next';
import { useAppData } from '../../composables/useAppData';
import { safeId } from '../../../services/id';
import type { AppData, Habit } from '../../../types';
import Button from '../ui/Button.vue';
import Modal from '../ui/Modal.vue';

interface Props {
  data: AppData;
}

const props = defineProps<Props>();
const { addHabit, removeHabit, updateHabit } = useAppData();
const showToast = inject<(message: string, type?: 'success' | 'error' | 'info') => void>('showToast')!;

const newItemName = ref('');
const newItemValue = ref<number | string>('');
const newItemEmoji = ref('⭐');

// Edit state
const isEditModalOpen = ref(false);
const editingHabitId = ref<string | null>(null);
const editItemName = ref('');
const editItemValue = ref<number | string>('');
const editItemEmoji = ref('⭐');

const handleAdd = async () => {
  if (!newItemName.value || !newItemValue.value) return;
  const val = typeof newItemValue.value === 'number' ? newItemValue.value : parseInt(String(newItemValue.value), 10);
  if (isNaN(val)) return;
  await addHabit({
    id: safeId(),
    name: newItemName.value,
    points: val,
    emoji: newItemEmoji.value,
  });
  newItemName.value = '';
  newItemValue.value = '';
  showToast('已添加任务!');
};

const handleRemove = async (id: string) => {
  await removeHabit(id);
};

const handleEdit = (habit: Habit) => {
  editingHabitId.value = habit.id;
  editItemName.value = habit.name;
  editItemValue.value = habit.points;
  editItemEmoji.value = habit.emoji;
  isEditModalOpen.value = true;
};

const closeEditModal = () => {
  isEditModalOpen.value = false;
  editingHabitId.value = null;
  editItemName.value = '';
  editItemValue.value = '';
  editItemEmoji.value = '⭐';
};

const handleSaveEdit = async () => {
  if (!editingHabitId.value || !editItemName.value || !editItemValue.value) return;
  const val = typeof editItemValue.value === 'number' ? editItemValue.value : parseInt(String(editItemValue.value), 10);
  if (isNaN(val)) {
    showToast('请输入有效的积分值', 'error');
    return;
  }
  await updateHabit(editingHabitId.value, {
    name: editItemName.value,
    points: val,
    emoji: editItemEmoji.value,
  });
  showToast('任务已更新!');
  closeEditModal();
};
</script>

