<template>
  <div v-if="!data" class="min-h-screen flex flex-col items-center justify-center bg-paper text-slate-400 gap-4">
    <div class="w-16 h-16 border-4 border-slate-300 border-t-primary rounded-full animate-spin"></div>
    <span class="font-bold">加载数据中...</span>
  </div>

  <div v-else class="min-h-screen pb-24 bg-indigo-50/50">
    <header class="bg-slate-800 border-b-[4px] border-black px-6 py-4 flex justify-between items-center fixed top-0 left-0 right-0 z-30 shadow-lg text-white" style="padding-top: env(safe-area-inset-top)">
      <div class="flex items-center gap-3">
        <button
          @click="$router.push('/parent')"
          class="p-2 bg-slate-700/50 hover:bg-slate-700 rounded-xl border-2 border-slate-600 transition-colors"
        >
          <ArrowLeft :size="20" />
        </button>
        <h1 class="font-bold text-xl tracking-tight">扣分快捷设置</h1>
      </div>
    </header>

    <div class="p-4 md:p-8 max-w-5xl mx-auto" style="padding-top: calc(env(safe-area-inset-top) + 6rem)">
      <div class="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div class="bg-white p-6 md:p-8 rounded-[2rem] border-[3px] border-black shadow-cartoon">
          <h3 class="font-black text-slate-800 mb-6 text-xl">添加扣分选项</h3>
          <div class="flex flex-col sm:flex-row gap-4">
            <input
              v-model="newItemName"
              placeholder="扣分项名称 (例如: 不听话)"
              class="flex-1 p-4 rounded-2xl border-2 border-slate-200 focus:outline-none focus:border-black focus:ring-0 font-bold bg-slate-50 transition-colors"
            />
            <div class="flex gap-3">
              <input
                v-model.number="newItemValue"
                type="number"
                placeholder="扣分"
                class="w-24 p-4 rounded-2xl border-2 border-slate-200 focus:outline-none focus:border-black focus:ring-0 font-bold bg-slate-50"
              />
              <input
                v-model="newItemEmoji"
                class="w-20 p-4 rounded-2xl border-2 border-slate-200 text-center text-xl cursor-pointer focus:border-black focus:outline-none bg-slate-50"
                title="输入一个Emoji"
              />
              <Button aria-label="添加扣分选项" @click="handleAdd" variant="danger" class="aspect-square flex items-center justify-center p-0 w-16">
                <Plus :size="28" :stroke-width="4" />
              </Button>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            v-for="deduction in data.deductions || []"
            :key="deduction.id"
            class="bg-white p-5 rounded-2xl border-[3px] border-black shadow-sm flex justify-between items-center group hover:-translate-y-1 transition-transform"
          >
            <div class="flex items-center gap-4">
              <div class="w-14 h-14 bg-red-50 border-2 border-black rounded-2xl flex items-center justify-center text-3xl shadow-sm">
                {{ deduction.emoji }}
              </div>
              <div>
                <p class="font-black text-slate-800 text-lg">{{ deduction.name }}</p>
                <p class="text-xs text-slate-500 font-bold bg-slate-100 px-2 py-1 rounded inline-block mt-1">扣除 {{ deduction.points }} 分</p>
              </div>
            </div>
            <div class="flex gap-2">
              <button
                @click="handleEdit(deduction)"
                class="text-slate-300 hover:text-blue-500 p-3 hover:bg-blue-50 rounded-xl transition-all"
                title="编辑"
              >
                <Edit2 :size="22" :stroke-width="2.5" />
              </button>
              <button
                @click="handleRemove(deduction.id)"
                class="text-slate-300 hover:text-red-500 p-3 hover:bg-red-50 rounded-xl transition-all"
                title="删除"
              >
                <Trash2 :size="22" :stroke-width="2.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Edit Modal -->
    <Modal :is-open="isEditModalOpen" title="编辑扣分选项" @close="closeEditModal">
      <div class="space-y-4">
        <div class="flex flex-col gap-4">
          <div>
            <label class="block text-sm font-bold text-slate-500 mb-2">扣分项名称</label>
            <input
              v-model="editItemName"
              placeholder="扣分项名称 (例如: 不听话)"
              class="w-full p-4 rounded-2xl border-2 border-slate-200 focus:outline-none focus:border-black focus:ring-0 font-bold bg-slate-50 transition-colors"
            />
          </div>
          <div>
            <label class="block text-sm font-bold text-slate-500 mb-2">扣除积分</label>
            <input
              v-model.number="editItemValue"
              type="number"
              placeholder="扣分"
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
import { ref, inject, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { Plus, Trash2, Edit2, ArrowLeft } from 'lucide-vue-next';
import { useAppData } from '../composables/useAppData';
import { safeId } from '../../services/id';
import type { Deduction } from '../../types';
import Button from '../components/ui/Button.vue';
import Modal from '../components/ui/Modal.vue';

const router = useRouter();
const { data, init, addDeduction, removeDeduction, updateDeduction } = useAppData();
const showToast = inject<(message: string, type?: 'success' | 'error' | 'info') => void>('showToast')!;

const newItemName = ref('');
const newItemValue = ref<number | string>('');
const newItemEmoji = ref('⚠️');

// Edit state
const isEditModalOpen = ref(false);
const editingDeductionId = ref<string | null>(null);
const editItemName = ref('');
const editItemValue = ref<number | string>('');
const editItemEmoji = ref('⚠️');

onMounted(() => {
  init();
});

const handleAdd = async () => {
  if (!newItemName.value || !newItemValue.value) return;
  const val = typeof newItemValue.value === 'number' ? newItemValue.value : parseInt(String(newItemValue.value), 10);
  if (isNaN(val)) return;
  await addDeduction({
    id: safeId(),
    name: newItemName.value,
    points: val,
    emoji: newItemEmoji.value,
  });
  newItemName.value = '';
  newItemValue.value = '';
  showToast('已添加扣分选项!');
};

const handleRemove = async (id: string) => {
  await removeDeduction(id);
  showToast('已删除扣分选项');
};

const handleEdit = (deduction: Deduction) => {
  editingDeductionId.value = deduction.id;
  editItemName.value = deduction.name;
  editItemValue.value = deduction.points;
  editItemEmoji.value = deduction.emoji;
  isEditModalOpen.value = true;
};

const closeEditModal = () => {
  isEditModalOpen.value = false;
  editingDeductionId.value = null;
  editItemName.value = '';
  editItemValue.value = '';
  editItemEmoji.value = '⚠️';
};

const handleSaveEdit = async () => {
  if (!editingDeductionId.value || !editItemName.value || !editItemValue.value) return;
  const val = typeof editItemValue.value === 'number' ? editItemValue.value : parseInt(String(editItemValue.value), 10);
  if (isNaN(val)) {
    showToast('请输入有效的积分值', 'error');
    return;
  }
  await updateDeduction(editingDeductionId.value, {
    name: editItemName.value,
    points: val,
    emoji: editItemEmoji.value,
  });
  showToast('扣分选项已更新!');
  closeEditModal();
};
</script>

