<template>
  <div class="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
    <div class="bg-white p-6 md:p-8 rounded-[2rem] border-[3px] border-black shadow-cartoon">
      <h3 class="font-black text-slate-800 mb-6 text-xl">添加自定义奖励</h3>
      <div class="flex flex-col sm:flex-row gap-4">
        <input
          v-model="newItemName"
          placeholder="奖励名称 (例如: 周末看电影)"
          class="flex-1 p-4 rounded-2xl border-2 border-slate-200 focus:outline-none focus:border-black focus:ring-0 font-bold bg-slate-50 transition-colors"
        />
        <div class="flex gap-3 items-center">
          <input
            v-model.number="newItemValue"
            type="number"
            placeholder="花费"
            class="w-24 p-4 rounded-2xl border-2 border-slate-200 focus:outline-none focus:border-black focus:ring-0 font-bold bg-slate-50"
          />
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-sm font-bold text-slate-500">奖励图片</span>
            <input
              id="rewardImageInput"
              type="file"
              accept="image/*"
              class="hidden"
              @change="handleImageChange"
            />
            <label
              for="rewardImageInput"
              class="px-4 py-2 rounded-2xl border-2 border-black bg-white hover:bg-slate-50 cursor-pointer font-bold shadow-cartoon-sm"
            >选择图片</label>
          </div>
          <img v-if="newItemImage" :src="newItemImage" alt="预览" class="w-16 h-16 object-cover rounded-2xl border-2 border-black" />
          <Button
            @click="handleAdd"
            :disabled="isImageReading"
            variant="secondary"
            :class="[
              'aspect-square flex items-center justify-center p-0 w-16 border-black text-white',
              isImageReading ? 'bg-slate-300 cursor-not-allowed' : 'bg-pink-500 hover:bg-pink-600'
            ]"
          >
            <Plus :size="28" :stroke-width="4" />
          </Button>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div
        v-for="reward in data.rewards"
        :key="reward.id"
        class="bg-white p-5 rounded-2xl border-[3px] border-black shadow-sm flex justify-between items-center group hover:-translate-y-1 transition-transform"
      >
        <div class="flex items-center gap-4">
          <div class="w-14 h-14 bg-pink-50 border-2 border-black rounded-2xl flex items-center justify-center text-3xl shadow-sm overflow-hidden">
            <img v-if="reward.image" :src="reward.image" :alt="reward.name" class="w-full h-full object-cover" />
            <span v-else>{{ reward.emoji }}</span>
          </div>
          <div>
            <p class="font-black text-slate-800 text-lg">{{ reward.name }}</p>
            <p class="text-xs text-slate-500 font-bold bg-slate-100 px-2 py-1 rounded inline-block mt-1">花费 {{ reward.cost }} 分</p>
          </div>
        </div>
        <div class="flex gap-2">
          <button
            @click="handleEdit(reward)"
            class="text-slate-300 hover:text-blue-500 p-3 hover:bg-blue-50 rounded-xl transition-all"
            title="编辑"
          >
            <Edit2 :size="22" :stroke-width="2.5" />
          </button>
          <button
            @click="handleRemove(reward.id)"
            class="text-slate-300 hover:text-red-500 p-3 hover:bg-red-50 rounded-xl transition-all"
            title="删除"
          >
            <Trash2 :size="22" :stroke-width="2.5" />
          </button>
        </div>
      </div>
    </div>

    <!-- Edit Modal -->
    <Modal :is-open="isEditModalOpen" title="编辑奖励" @close="closeEditModal">
      <div class="space-y-4">
        <div class="flex flex-col gap-4">
          <div>
            <label class="block text-sm font-bold text-slate-500 mb-2">奖励名称</label>
            <input
              v-model="editItemName"
              placeholder="奖励名称 (例如: 周末看电影)"
              class="w-full p-4 rounded-2xl border-2 border-slate-200 focus:outline-none focus:border-black focus:ring-0 font-bold bg-slate-50 transition-colors"
            />
          </div>
          <div>
            <label class="block text-sm font-bold text-slate-500 mb-2">花费积分</label>
            <input
              v-model.number="editItemValue"
              type="number"
              placeholder="花费"
              class="w-full p-4 rounded-2xl border-2 border-slate-200 focus:outline-none focus:border-black focus:ring-0 font-bold bg-slate-50"
            />
          </div>
          <div>
            <label class="block text-sm font-bold text-slate-500 mb-2">奖励图片</label>
            <div class="flex items-center gap-3">
              <input
                id="editRewardImageInput"
                type="file"
                accept="image/*"
                class="hidden"
                @change="handleEditImageChange"
              />
              <label
                for="editRewardImageInput"
                class="px-4 py-2 rounded-2xl border-2 border-black bg-white hover:bg-slate-50 cursor-pointer font-bold shadow-cartoon-sm"
              >选择图片</label>
              <img v-if="editItemImage" :src="editItemImage" alt="预览" class="w-16 h-16 object-cover rounded-2xl border-2 border-black" />
              <button
                v-if="editItemImage"
                @click="editItemImage = null"
                class="px-3 py-1 rounded-xl border-2 border-red-300 bg-red-50 hover:bg-red-100 text-red-600 font-bold text-sm"
              >
                清除图片
              </button>
            </div>
          </div>
        </div>
        <div class="flex gap-3 justify-end">
          <Button variant="secondary" @click="closeEditModal">取消</Button>
          <Button
            variant="primary"
            @click="handleSaveEdit"
            :disabled="isEditImageReading"
          >
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
import type { AppData, Reward } from '../../../types';
import Button from '../ui/Button.vue';
import Modal from '../ui/Modal.vue';

interface Props {
  data: AppData;
}

const props = defineProps<Props>();
const { addReward, removeReward, updateReward } = useAppData();
const showToast = inject<(message: string, type?: 'success' | 'error' | 'info') => void>('showToast')!;

const newItemName = ref('');
const newItemValue = ref<number | string>('');
const newItemImage = ref<string | null>(null);
const isImageReading = ref(false);

// Edit state
const isEditModalOpen = ref(false);
const editingRewardId = ref<string | null>(null);
const editItemName = ref('');
const editItemValue = ref<number | string>('');
const editItemImage = ref<string | null>(null);
const isEditImageReading = ref(false);

const handleImageChange = async (e: Event) => {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) {
    newItemImage.value = null;
    return;
  }
  const reader = new FileReader();
  isImageReading.value = true;
  reader.onload = () => {
    const result = reader.result as string;
    const img = new Image();
    img.onload = () => {
      const maxDim = 800;
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const compressed = canvas.toDataURL('image/jpeg', 0.85);
        newItemImage.value = compressed;
      } else {
        newItemImage.value = result;
      }
      isImageReading.value = false;
    };
    img.onerror = () => {
      newItemImage.value = result;
      isImageReading.value = false;
    };
    img.src = result;
  };
  reader.onerror = () => {
    isImageReading.value = false;
  };
  reader.readAsDataURL(file);
};

const handleAdd = async () => {
  if (!newItemName.value || !newItemValue.value) return;
  const val = typeof newItemValue.value === 'number' ? newItemValue.value : parseInt(String(newItemValue.value), 10);
  if (isNaN(val)) return;
  await addReward({
    id: safeId(),
    name: newItemName.value,
    cost: val,
    emoji: '⭐',
    image: newItemImage.value ?? undefined,
  });
  newItemName.value = '';
  newItemValue.value = '';
  newItemImage.value = null;
  showToast('已添加奖励!');
};

const handleRemove = async (id: string) => {
  await removeReward(id);
};

const handleEdit = (reward: Reward) => {
  editingRewardId.value = reward.id;
  editItemName.value = reward.name;
  editItemValue.value = reward.cost;
  editItemImage.value = reward.image ?? null;
  isEditModalOpen.value = true;
};

const closeEditModal = () => {
  isEditModalOpen.value = false;
  editingRewardId.value = null;
  editItemName.value = '';
  editItemValue.value = '';
  editItemImage.value = null;
};

const handleEditImageChange = async (e: Event) => {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) {
    editItemImage.value = null;
    return;
  }
  const reader = new FileReader();
  isEditImageReading.value = true;
  reader.onload = () => {
    const result = reader.result as string;
    const img = new Image();
    img.onload = () => {
      const maxDim = 800;
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const compressed = canvas.toDataURL('image/jpeg', 0.85);
        editItemImage.value = compressed;
      } else {
        editItemImage.value = result;
      }
      isEditImageReading.value = false;
    };
    img.onerror = () => {
      editItemImage.value = result;
      isEditImageReading.value = false;
    };
    img.src = result;
  };
  reader.onerror = () => {
    isEditImageReading.value = false;
  };
  reader.readAsDataURL(file);
};

const handleSaveEdit = async () => {
  if (!editingRewardId.value || !editItemName.value || !editItemValue.value) return;
  const val = typeof editItemValue.value === 'number' ? editItemValue.value : parseInt(String(editItemValue.value), 10);
  if (isNaN(val)) {
    showToast('请输入有效的积分值', 'error');
    return;
  }
  await updateReward(editingRewardId.value, {
    name: editItemName.value,
    cost: val,
    image: editItemImage.value ?? undefined,
  });
  showToast('奖励已更新!');
  closeEditModal();
};
</script>

